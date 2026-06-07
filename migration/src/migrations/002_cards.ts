/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log } from "../lib/logger";
import { fetchIssueData, parseIssueNumber } from "../lib/github";

const BATCH_SIZE = 500;
const userId = "120834530801221634";

const factionMap: Record<string, string> = {
    "House Baratheon": "baratheon",
    "House Greyjoy": "greyjoy",
    "House Lannister": "lannister",
    "House Martell": "martell",
    "The Night's Watch": "thenightswatch",
    "House Stark": "stark",
    "House Targaryen": "targaryen",
    "House Tyrell": "tyrell",
    "Neutral": "neutral"
};

const compareSemver = (a: string, b: string): number => {
    const pa = a.split(".");
    const pb = b.split(".");
    for (let i = 0; i < 3; i++) {
        const na = Number(pa[i]);
        const nb = Number(pb[i]);
        if (na > nb) return 1;
        if (nb > na) return -1;
    }
    return 0;
};

export const migration: Migration = {
    name: "002_cards",
    description: "Copy & migrate cards from source to destination, fetching GitHub issue data",

    async run({ sourceDb, destDb, dryRun }) {
        const source = sourceDb.collection("cards");
        const dest = destDb.collection("cards");

        log.info("Fetching cards from source...");
        const allCards = await source.find({}).toArray();
        log.info(`Found ${allCards.length} cards`);

        if (allCards.length === 0) {
            log.warn("No cards found in source — skipping");
            return;
        }

        // Pre-fetch all GitHub issues upfront (cache deduplicates)
        const cardsWithIssues = allCards.filter(c => c.github?.issueUrl);
        log.info(`Fetching GitHub data for ${cardsWithIssues.length} card(s) with issues...`);

        let githubFetchErrors = 0;
        for (const card of cardsWithIssues) {
            const issueNumber = parseIssueNumber(card.github.issueUrl);
            if (issueNumber !== null) {
                try {
                    await fetchIssueData(issueNumber);
                } catch (err) {
                    log.error(`Failed to fetch issue for card ${card._id}`, err);
                    githubFetchErrors++;
                }
            }
        }
        if (githubFetchErrors > 0) {
            log.warn(`${githubFetchErrors} GitHub issue(s) failed to fetch — those cards will retain their existing status`);
        }

        const now = new Date();
        const latestMap: Record<string, { id: ObjectId; version: string }> = {};
        const docs: Record<string, any>[] = [];

        log.info("Transforming cards...");
        for (const card of allCards) {
            const newId = new ObjectId();
            const newDoc: Record<string, any> = {
                ...card,
                _id: newId,
                project: card.projectId,
                latest: false,
                draft: !card.playtesting,
                implemented: card.playtesting && (!card.github || card.github?.status === "complete"),
                created: now,
                createdBy: userId,
                updated: now,
                updatedBy: userId,
                cardUpdated: now
            };

            // Code calculation
            if (newDoc.release) {
                newDoc.code = `${newDoc.project}${newDoc.release.number.toString().padStart(3, "0")}`;
            } else {
                newDoc.code = `${newDoc.project}${newDoc.number + 500}`;
            }

            // GitHub — fetch fresh data from API if we have an issue URL
            if (newDoc.github) {
                const issueNumber = newDoc.github.issueUrl ? parseIssueNumber(newDoc.github.issueUrl) : null;
                if (issueNumber !== null) {
                    const issueData = await fetchIssueData(issueNumber).catch(() => null);
                    if (issueData) {
                        newDoc.github = {
                            status: issueData.status,
                            issueUrl: issueData.issueUrl,
                            closedAt: issueData.closedAt ?? undefined,
                            lastSynced: now
                        };
                    } else {
                        if (newDoc.github.status === "complete") newDoc.github.status = "closed";
                        if (newDoc.github.status === "closed") newDoc.github.closedAt = now;
                        newDoc.github.lastSynced = now;
                    }
                } else {
                    if (newDoc.github.status === "complete") newDoc.github.status = "closed";
                    if (newDoc.github.status === "closed") newDoc.github.closedAt = now;
                    newDoc.github.lastSynced = now;
                }
            }

            if (newDoc.faction && factionMap[newDoc.faction]) newDoc.faction = factionMap[newDoc.faction];
            if (newDoc.type) newDoc.type = (newDoc.type as string).toLowerCase();
            if (newDoc.note?.type) newDoc.note.type = (newDoc.note.type as string).toLowerCase();
            if (newDoc.text) newDoc.text = (newDoc.text as string).replace(/\r/g, "");

            delete newDoc.projectId;
            delete newDoc["note.type"];
            delete newDoc.playtesting;

            const key = `${newDoc.project}-${newDoc.number}`;
            if (!latestMap[key] || compareSemver(newDoc.version, latestMap[key].version) > 0) {
                latestMap[key] = { id: newId, version: newDoc.version };
            }

            docs.push(newDoc);
        }

        // Flip latest flags
        const latestIds = new Set(Object.values(latestMap).map(v => v.id.toString()));
        for (const doc of docs) {
            if (latestIds.has(doc._id.toString())) doc.latest = true;
        }

        if (dryRun) {
            log.info("[dry-run] Would drop dest \"cards\" collection");
            log.info(`[dry-run] Would insert ${docs.length} transformed card(s)`);
            log.info("[dry-run] Would create unique index on { project, number, version }");
            return;
        }

        log.info("Dropping destination collection...");
        await dest.drop().catch(() => { /* collection may not exist yet */ });

        log.info("Inserting transformed cards...");
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            await dest.insertMany(batch, { ordered: true });
            log.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${batch.length}`);
        }

        await dest.createIndex({ project: 1, number: 1, version: 1 }, { unique: true });
        log.success("Cards migration complete");
    }
};
