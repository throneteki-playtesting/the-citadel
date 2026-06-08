/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { loadAllIssues, getIssueByNumber, getIssueByCardCode, parseIssueNumber } from "../lib/github";

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

        // Load all GitHub issues into memory once — no per-card API calls needed
        log.info("Loading GitHub issues into memory...");
        await loadAllIssues();

        const now = new Date();
        const latestMap: Record<string, { key: string; version: string }> = {};
        const docs: Record<string, any>[] = [];
        let issueFound = 0, issueMissing = 0;

        const transformProgress = createProgress("Transforming");
        for (let i = 0; i < allCards.length; i++) {
            const card = allCards[i];
            transformProgress.counter(i + 1, allCards.length);

            const newDoc: Record<string, any> = {
                ...card,
                project: card.projectId,
                latest: false,
                draft: !card.playtesting,
                implemented: card.playtesting && (!card.github || card.github?.status === "complete"),
                updated: now,
                updatedBy: userId,
                cardUpdated: now
            };

            if (newDoc.release) {
                newDoc.code = `${newDoc.project}${newDoc.release.number.toString().padStart(3, "0")}`;
            } else {
                newDoc.code = `${newDoc.project}${(newDoc.number + 500).toString().padStart(3, "0")}`;
            }

            if (newDoc.github) {
                // Card already has github data — refresh from in-memory index by issue number
                const issueNumber = newDoc.github.issueUrl ? parseIssueNumber(newDoc.github.issueUrl) : null;
                const issueData = issueNumber !== null ? getIssueByNumber(issueNumber) : null;

                if (issueData) {
                    newDoc.github = {
                        status: issueData.status,
                        issueUrl: issueData.issueUrl,
                        closedAt: issueData.closedAt ?? undefined,
                        lastSynced: now
                    };
                } else {
                    // Issue not found in index — normalise what we have
                    if (newDoc.github.status === "complete") newDoc.github.status = "closed";
                    if (newDoc.github.status === "closed") newDoc.github.closedAt = now;
                    newDoc.github.lastSynced = now;
                }
            } else {
                // No github data — look up by card code + version from the in-memory index
                const issueData = getIssueByCardCode(newDoc.code, newDoc.version);
                if (issueData) {
                    newDoc.github = {
                        status: issueData.status,
                        issueUrl: issueData.issueUrl,
                        closedAt: issueData.closedAt ?? undefined,
                        lastSynced: now
                    };
                    issueFound++;
                } else {
                    issueMissing++;
                }
            }

            if (newDoc.faction && factionMap[newDoc.faction]) newDoc.faction = factionMap[newDoc.faction];
            if (newDoc.type) newDoc.type = (newDoc.type as string).toLowerCase();
            if (newDoc.note?.type) newDoc.note.type = (newDoc.note.type as string).toLowerCase();
            if (newDoc.text) newDoc.text = (newDoc.text as string).replace(/\r/g, "");

            delete newDoc._id;
            delete newDoc.projectId;
            delete newDoc["note.type"];
            delete newDoc.playtesting;

            const key = `${newDoc.project}-${newDoc.number}`;
            if (!latestMap[key] || compareSemver(newDoc.version, latestMap[key].version) > 0) {
                latestMap[key] = { key: `${newDoc.project}-${newDoc.number}-${newDoc.version}`, version: newDoc.version };
            }

            docs.push(newDoc);
        }
        transformProgress.done(
            `done — ${issueMissing + issueFound > 0 ? `issue lookup: ${issueFound} found, ${issueMissing} not found` : "no issue lookups needed"}`
        );

        const latestKeys = new Set(Object.values(latestMap).map(v => v.key));
        for (const doc of docs) {
            if (latestKeys.has(`${doc.project}-${doc.number}-${doc.version}`)) doc.latest = true;
        }

        if (dryRun) {
            log.info("[dry-run] Would drop dest \"cards\" collection");
            log.info(`[dry-run] Would insert ${docs.length} transformed card(s)`);
            log.info("[dry-run] Would create unique index on { project, number, version }");
            return;
        }

        log.info("Dropping destination collection...");
        await dest.drop().catch(() => { /* may not exist */ });

        const saveProgress = createProgress("Saving");
        let inserted = 0;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            const ops = batch.map(doc => ({
                insertOne: { document: { _id: new ObjectId(), created: now, createdBy: userId, ...doc } }
            }));
            const result = await dest.bulkWrite(ops, { ordered: true });
            inserted += result.insertedCount;
            saveProgress.counter(inserted, docs.length);
        }
        saveProgress.done("done");

        await dest.createIndex({ project: 1, number: 1, version: 1 }, { unique: true });
        log.success(`Cards migration complete — ${inserted} inserted`);
    }
};