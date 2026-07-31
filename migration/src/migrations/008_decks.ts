/* eslint-disable @typescript-eslint/no-explicit-any */
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";

const BATCH_SIZE = 100;

const DECK_LINK_REGEX = /^https:\/\/thronesdb\.com\/deck\/view\/([0-9a-fA-F-]{36})$/;
const DECKLIST_LINK_REGEX = /^https:\/\/thronesdb\.com\/decklist\/view\/(\d+)\/.*$/;

function extractDeckIdentifier(link: string): number | string | undefined {
    const decklistMatch = link.match(DECKLIST_LINK_REGEX);
    if (decklistMatch) {
        return Number(decklistMatch[1]);
    }
    const deckMatch = link.match(DECK_LINK_REGEX);
    if (deckMatch) {
        return deckMatch[1];
    }
    return undefined;
}

// Playtesting codes are `${project}${number + 500}` - the last 3 digits (500-999) are number+500
function isPlaytestingCode(code: string): boolean {
    const value = Math.abs(parseInt(code));
    const remainder = value % 1000;
    return remainder >= 500 && remainder <= 999;
}

function parsePlaytestCode(code: string): { project: number; number: number } | undefined {
    if (!isPlaytestingCode(code)) {
        return undefined;
    }
    const value = Math.abs(parseInt(code));
    return { project: Math.floor(value / 1000), number: (value % 1000) - 500 };
}

function playtestCode(project: number, number: number): string {
    return `${project}${number + 500}`;
}

// The real ThronesDB code for a released card - IPlaytestCard.released.code is the *pack's* short
// code (eg. "TFE"), not a card code, so it must be derived from released.number instead.
function releasedCardCode(project: number, releasedNumber: number): string {
    return `${project}${releasedNumber.toString().padStart(3, "0")}`;
}

let cachedToken: string | undefined;
async function getThronesDBToken(): Promise<string | undefined> {
    if (cachedToken) {
        return cachedToken;
    }
    if (!process.env.THRONESDB_CLIENT_ID || !process.env.THRONESDB_CLIENT_SECRET) {
        return undefined;
    }
    const response = await fetch("https://thronesdb.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.THRONESDB_CLIENT_ID,
            client_secret: process.env.THRONESDB_CLIENT_SECRET,
            grant_type: "client_credentials"
        })
    });
    if (!response.ok) {
        log.warn(`Failed to fetch ThronesDB OAuth2 token: ${response.statusText} — private/UUID decks will be skipped`);
        return undefined;
    }
    const data = (await response.json()) as { access_token: string };
    cachedToken = data.access_token;
    return cachedToken;
}

async function fetchTDBDeck(identifier: number | string): Promise<any | undefined> {
    let response: Response;
    if (typeof identifier === "number") {
        response = await fetch(`https://thronesdb.com/api/public/decklist/${identifier}`);
    } else {
        const token = await getThronesDBToken();
        if (!token) {
            return undefined;
        }
        response = await fetch(`https://thronesdb.com/api/oauth2/deck/load/${identifier}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    }
    if (!response.ok) {
        return undefined;
    }
    return response.json();
}

// A deck is owned by the earliest review that shared it, and last touched by the most recently
// updated one - the migration itself is never the author.
interface Attribution {
    created: Date;
    createdBy: string;
    updated: Date;
    updatedBy: string;
}

function buildAttribution(reviews: any[], now: Date): Map<string, Attribution> {
    const attribution = new Map<string, Attribution>();

    const ordered = [...reviews].sort(
        (a, b) => new Date(a.created ?? a.updated ?? now).getTime() - new Date(b.created ?? b.updated ?? now).getTime()
    );

    for (const review of ordered) {
        const reviewer = review.reviewer as string;
        if (!reviewer) {
            continue;
        }
        const created = new Date(review.created ?? review.updated ?? now);
        const updated = new Date(review.updated ?? review.created ?? now);

        for (const deck of review.decks ?? []) {
            if (!deck?.link || deck.shared === false) {
                continue;
            }
            const current = attribution.get(deck.link);
            if (!current) {
                attribution.set(deck.link, { created, createdBy: reviewer, updated, updatedBy: reviewer });
            } else if (updated.getTime() >= current.updated.getTime()) {
                current.updated = updated;
                current.updatedBy = reviewer;
            }
        }
    }

    return attribution;
}

export const migration: Migration = {
    name: "008_decks",
    description:
        "Extract decks referenced by reviews' shared deck links into a standalone decks collection, attributed to the reviewers who shared them - decks already present are left as-is apart from that attribution",

    async run({ destDb, dryRun }) {
        const reviewsCol = destDb.collection("reviews");
        const cardsCol = destDb.collection("cards");
        const decksCol = destDb.collection("decks");

        const now = new Date();
        const reviews = await reviewsCol.find({}).toArray();
        const attribution = buildAttribution(reviews, now);
        log.info(`Found ${attribution.size} unique shared deck link(s) across ${reviews.length} review(s)`);

        if (attribution.size === 0) {
            log.info("Nothing to migrate");
            return;
        }

        // Decks already in the collection are maintained by the app - only their attribution is
        // corrected here, so they need neither a ThronesDB fetch nor card version resolution.
        const existing = await decksCol.find({}, { projection: { identifier: 1 } }).toArray();
        const existingIdentifiers = new Set(existing.map((deck) => String(deck.identifier)));

        const planned: { link: string; identifier: number | string; audit: Attribution; isNew: boolean }[] = [];
        let skipped = 0;
        for (const [link, audit] of attribution) {
            const identifier = extractDeckIdentifier(link);
            if (!identifier) {
                skipped++;
                log.verbose(`Skipping "${link}" — could not extract identifier`);
                continue;
            }
            planned.push({ link, identifier, audit, isNew: !existingIdentifiers.has(String(identifier)) });
        }
        const toFetch = planned.filter((entry) => entry.isNew).length;

        if (dryRun) {
            log.info(`[dry-run] Would fetch & insert up to ${toFetch} new deck(s) from ThronesDB`);
            log.info(`[dry-run] Would re-attribute ${planned.length - toFetch} existing deck(s)`);
            log.info(`[dry-run] ${skipped} link(s) skipped (no extractable identifier)`);
            return;
        }

        const cards = toFetch > 0 ? await cardsCol.find({}).toArray() : [];

        const ops: object[] = [];
        let reattributed = 0;

        const progress = createProgress("decks");
        let done = 0;
        for (const { link, identifier, audit, isNew } of planned) {
            done++;
            progress.counter(done, planned.length);

            if (!isNew) {
                reattributed++;
                ops.push({
                    updateOne: {
                        filter: { identifier },
                        update: { $set: { ...audit } }
                    }
                });
                continue;
            }

            const decklist = await fetchTDBDeck(identifier);
            if (!decklist) {
                skipped++;
                log.verbose(`Skipping "${link}" — could not be fetched (deleted, private, or unavailable)`);
                continue;
            }

            const deckUpdatedTime = new Date(decklist.date_update).getTime();
            const cardVersions: Record<string, string> = {};
            for (const code of Object.keys(decklist.slots ?? {})) {
                // Real (post-release) codes are reverse-mapped via the matching card's `released` stamp.
                const parsed =
                    parsePlaytestCode(code) ??
                    cards.find(
                        (card: any) => card.released && releasedCardCode(card.project, card.released.number) === code
                    );
                if (!parsed) {
                    continue;
                }
                const candidates = cards.filter(
                    (card: any) =>
                        !card.draft &&
                        card.project === parsed.project &&
                        card.number === parsed.number &&
                        new Date(card.updated).getTime() <= deckUpdatedTime
                );
                const latest = candidates.reduce(
                    (best: any, card: any) =>
                        !best || new Date(card.updated).getTime() > new Date(best.updated).getTime() ? card : best,
                    undefined
                );
                if (latest && !latest.released) {
                    cardVersions[playtestCode(latest.project, latest.number)] = latest.version;
                }
            }

            ops.push({
                updateOne: {
                    filter: { identifier },
                    update: {
                        $set: {
                            identifier,
                            link,
                            name: decklist.name,
                            faction: decklist.faction_code,
                            agendas: decklist.agendas,
                            tdbVersion: decklist.version,
                            tdbUpdated: decklist.date_update,
                            cards: cardVersions,
                            source: "review",
                            ...audit
                        }
                    },
                    upsert: true
                }
            });
        }
        progress.done(`${ops.length - reattributed} fetched, ${reattributed} re-attributed, ${skipped} skipped`);

        if (ops.length === 0) {
            log.warn("No decks to write — nothing committed");
            return;
        }

        let upserted = 0,
            modified = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            const result = await decksCol.bulkWrite(batch as any, { ordered: false });
            upserted += result.upsertedCount;
            modified += result.modifiedCount;
        }

        await decksCol.dropIndex("identifier_1").catch(() => undefined);
        await decksCol.createIndex({ identifier: 1 }, { unique: true });

        log.success(`Decks migration complete — ${upserted} inserted, ${modified} updated, ${skipped} skipped`);
    }
};
