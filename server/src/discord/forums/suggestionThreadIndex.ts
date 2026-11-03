import { Mutex } from "async-mutex";
import { ThreadChannel } from "discord.js";
import { ICard } from "common/models/cards";
import { dataService, logger } from "@/services";
import {
    DISCORD_FETCH_LIMIT,
    describeLegacyThread,
    getSuggestionForum,
    isThreadMigrated,
    LegacyThread,
    threadMatchesCard
} from "./legacySuggestionThreads";
import { FORUM_NAME } from "./suggestionForum";

// Discord can't list threads by owner and serves archived ones only by paging, so the whole forum is indexed once.
// A stale index is served while a refresh runs behind it, paging newest-archived first until a known thread.
const INDEX_KEY = "suggestionForum:threads";
const INDEX_FRESH_MS = 10 * 60 * 1000;
const INDEX_REBUILD_MS = 24 * 60 * 60 * 1000;

interface IndexedThread extends Omit<LegacyThread, "createdAt"> {
    createdAt: number;
    active: boolean;
}

interface ThreadIndex {
    threads: Record<string, IndexedThread>;
    refreshedAt: number;
    builtAt: number;
}

const indexLock = new Mutex();
let memoryIndex: ThreadIndex | undefined;
let refreshing: Promise<ThreadIndex> | undefined;

function toIndexed(thread: ThreadChannel): IndexedThread {
    const { createdAt, ...legacy } = describeLegacyThread(thread);
    return { ...legacy, createdAt: createdAt.getTime(), active: !thread.archived };
}

function fromIndexed({ id, url, name, createdAt, ownerId, faction, type }: IndexedThread): LegacyThread {
    return { id, url, name, createdAt: new Date(createdAt), ownerId, faction, type };
}

async function readIndex(): Promise<ThreadIndex | undefined> {
    if (memoryIndex) {
        return memoryIndex;
    }
    const raw = await dataService.redis.get(INDEX_KEY);
    memoryIndex = raw ? (JSON.parse(String(raw)) as ThreadIndex) : undefined;
    if (memoryIndex) {
        logger.info(
            `[Discord] Loaded ${Object.keys(memoryIndex.threads).length} indexed ${FORUM_NAME} threads from Redis (refreshed ${new Date(memoryIndex.refreshedAt).toISOString()})`
        );
    }
    return memoryIndex;
}

async function writeIndex(index: ThreadIndex) {
    memoryIndex = index;
    await dataService.redis.set(INDEX_KEY, JSON.stringify(index));
}

async function buildIndex(): Promise<ThreadIndex> {
    const previous = await readIndex();
    const started = Date.now();
    const isFull = !previous || started - previous.builtAt > INDEX_REBUILD_MS;
    const forum = await getSuggestionForum();
    const mode = isFull ? (previous ? "full rebuild, last one was over a day ago" : "first build") : "incremental";
    logger.info(`[Discord] Indexing ${FORUM_NAME} threads (${mode})...`);

    const threads: Record<string, IndexedThread> = {};
    if (!isFull) {
        for (const thread of Object.values(previous.threads)) {
            if (!thread.active) {
                threads[thread.id] = thread;
            }
        }
    }

    let before: string | undefined;
    let pages = 0;
    for (;;) {
        const page = await forum.threads.fetchArchived({ before, limit: DISCORD_FETCH_LIMIT });
        pages++;
        let reachedKnown = false;
        for (const thread of page.threads.values()) {
            const known = isFull ? undefined : previous.threads[thread.id];
            reachedKnown ||= !!known && !known.active;
            threads[thread.id] = toIndexed(thread);
        }
        if (reachedKnown || !page.hasMore || page.threads.size === 0) {
            break;
        }
        before = page.threads.last()?.id;
    }

    const active = (await forum.threads.fetchActive()).threads;
    for (const thread of active.values()) {
        threads[thread.id] = toIndexed(thread);
    }

    const index = { threads, refreshedAt: started, builtAt: isFull ? started : previous.builtAt };
    await writeIndex(index);
    logger.info(
        `[Discord] Indexed ${Object.keys(threads).length} threads of ${FORUM_NAME} (${active.size} active, ${pages} archived page${pages === 1 ? "" : "s"} read) in ${Date.now() - started}ms`
    );
    return index;
}

function refreshIndex() {
    refreshing ??= indexLock.runExclusive(buildIndex).finally(() => {
        refreshing = undefined;
    });
    return refreshing;
}

async function getThreadIndex(): Promise<ThreadIndex> {
    const index = await readIndex();
    if (!index) {
        return refreshIndex();
    }
    if (Date.now() - index.refreshedAt > INDEX_FRESH_MS) {
        logger.info(`[Discord] ${FORUM_NAME} thread index is stale - refreshing in the background`);
        refreshIndex().catch((err) =>
            logger.warn(new Error("[Discord] Failed to refresh thread index", { cause: err }))
        );
    }
    return index;
}

// Does nothing until the first build has run, which picks the thread up anyway
async function updateIndexedThreads(change: (threads: Record<string, IndexedThread>) => void) {
    await indexLock.runExclusive(async () => {
        const index = await readIndex();
        if (index) {
            const threads = { ...index.threads };
            change(threads);
            await writeIndex({ ...index, threads });
        }
    });
}

export async function warmThreadIndex() {
    logger.info(`[Discord] Warming ${FORUM_NAME} thread index...`);
    try {
        await getThreadIndex();
        logger.info(`[Discord] ${FORUM_NAME} thread index is ready`);
    } catch (err) {
        logger.warn(new Error("[Discord] Failed to build thread index", { cause: err }));
    }
}

export function indexThread(thread: ThreadChannel) {
    return updateIndexedThreads((threads) => {
        threads[thread.id] = toIndexed(thread);
    });
}

export function unindexThread(threadId: string) {
    return updateIndexedThreads((threads) => {
        delete threads[threadId];
    });
}

// Newest first
export async function findLegacyThreads(ownerId: string, card: Partial<ICard>): Promise<LegacyThread[]> {
    const started = Date.now();
    const { threads } = await getThreadIndex();
    const matching = Object.values(threads).filter(
        (thread) => thread.ownerId === ownerId && threadMatchesCard(thread, card)
    );
    const migrated = await Promise.all(matching.map((thread) => isThreadMigrated(thread.url)));
    const unmigrated = matching.filter((_thread, index) => !migrated[index]);
    logger.info(
        `[Discord] Found ${unmigrated.length} unmigrated ${FORUM_NAME} thread(s) for "${card.name}" by ${ownerId} (${matching.length} matched by name) in ${Date.now() - started}ms`
    );
    return unmigrated.sort((a, b) => b.createdAt - a.createdAt).map(fromIndexed);
}
