/* eslint-disable @typescript-eslint/no-explicit-any */
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";

const userId = "120834530801221634";

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

function parsePlaytestCode(code: string): { project: number, number: number } | undefined {
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
    const data = await response.json() as { access_token: string };
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

export const migration: Migration = {
    name: "008_decks",
    description: "Extract decks referenced by reviews' shared deck links into a standalone decks collection",

    async run({ destDb, dryRun }) {
        const reviewsCol = destDb.collection("reviews");
        const cardsCol = destDb.collection("cards");
        const decksCol = destDb.collection("decks");

        const reviews = await reviewsCol.find({}).toArray();

        const links = new Set<string>();
        for (const review of reviews) {
            for (const deck of review.decks ?? []) {
                if (deck?.link && deck.shared !== false) {
                    links.add(deck.link);
                }
            }
        }
        log.info(`Found ${links.size} unique shared deck link(s) across ${reviews.length} review(s)`);

        if (links.size === 0) {
            log.info("Nothing to migrate");
            return;
        }

        const cards = await cardsCol.find({}).toArray();

        if (dryRun) {
            log.info(`[dry-run] Would fetch & upsert up to ${links.size} deck(s) from ThronesDB`);
            return;
        }

        const now = new Date();
        const ops: object[] = [];
        let skipped = 0;

        const progress = createProgress("decks");
        let done = 0;
        for (const link of links) {
            done++;
            progress.counter(done, links.size);

            const identifier = extractDeckIdentifier(link);
            if (!identifier) {
                skipped++;
                log.verbose(`Skipping "${link}" — could not extract identifier`);
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
                // A slot code may reference a card by its temporary playtesting code, or - once
                // released - by its real ThronesDB code (derived from released.number).
                const parsed = parsePlaytestCode(code);
                const candidates = cards.filter((card: any) =>
                    !card.draft &&
                    new Date(card.updated).getTime() <= deckUpdatedTime &&
                    (parsed
                        ? (card.project === parsed.project && card.number === parsed.number)
                        : (card.released && releasedCardCode(card.project, card.released.number) === code))
                );
                const latest = candidates.reduce((best: any, card: any) =>
                    (!best || new Date(card.updated).getTime() > new Date(best.updated).getTime()) ? card : best, undefined);
                if (latest) {
                    // Always key by the canonical playtesting code, regardless of which code the deck itself referenced
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
                            updated: now,
                            updatedBy: userId
                        },
                        $setOnInsert: { created: now, createdBy: userId }
                    },
                    upsert: true
                }
            });
        }
        progress.done(`${ops.length} fetched, ${skipped} skipped`);

        if (ops.length === 0) {
            log.warn("No decks to write after fetching — nothing committed");
            return;
        }

        let upserted = 0, modified = 0;
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
