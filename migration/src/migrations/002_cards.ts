/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { loadAllIssues, getIssueByNumber, getIssueByCardCode, parseIssueNumber } from "../lib/github";
import { fetchCardForumThreads } from "../lib/discord";

const BATCH_SIZE = 500;
const userId = "120834530801221634";

const releasePackDates: Record<string, Date> = {
    WAID: new Date("2025-05-18"),
    WoW: new Date("2025-07-02"),
    MaV: new Date("2025-08-24"),
    LotW: new Date("2025-10-03"),
    JfE: new Date("2025-12-07"),
    NCbT: new Date("2026-02-07")
};

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
        const issueFound: string[] = [], issueMissing: string[] = [], unknownDates: string[] = [];

        const transformProgress = createProgress("Transforming");
        for (let i = 0; i < allCards.length; i++) {
            const card = allCards[i];
            transformProgress.counter(i + 1, allCards.length);

            const newDoc: Record<string, any> = {
                ...card,
                project: card.projectId,
                latest: false,
                draft: !card.playtesting || card.version !== card.playtesting,
                implemented: card.playtesting && (!card.github || card.github?.status === "complete"),
                updatedBy: userId
            };

            if (newDoc.release) {
                newDoc.code = `${newDoc.project}${newDoc.release.number.toString().padStart(3, "0")}`;
                const releaseDate = releasePackDates[newDoc.release.short];
                if (releaseDate) {
                    newDoc.created = releaseDate;
                    newDoc.updated = releaseDate;
                }
            } else {
                newDoc.code = `${newDoc.project}${(newDoc.number + 500).toString().padStart(3, "0")}`;
            }

            const rawGithub = newDoc.github;
            delete newDoc.github;

            if (newDoc.imageUrl) {
                newDoc._metadata = { ...(newDoc._metadata ?? {}), imageUrl: newDoc.imageUrl };
                delete newDoc.imageUrl;
            }

            if (rawGithub) {
                // Card already has github data — refresh from in-memory index by issue number
                const issueNumber = rawGithub.issueUrl ? parseIssueNumber(rawGithub.issueUrl) : null;
                const issueData = issueNumber !== null ? getIssueByNumber(issueNumber) : null;

                if (issueData) {
                    newDoc._metadata = {
                        github: {
                            status: issueData.status,
                            issueUrl: issueData.issueUrl,
                            closedAt: issueData.closedAt ?? undefined,
                            lastSynced: now
                        }
                    };
                    newDoc.created = issueData.created;
                    newDoc.updated = issueData.created;
                } else {
                    // Issue not found in index — normalise what we have
                    if (rawGithub.status === "complete") rawGithub.status = "closed";
                    if (rawGithub.status === "closed") rawGithub.closedAt = now;
                    rawGithub.lastSynced = now;
                    newDoc._metadata = { github: rawGithub };
                }
            } else {
                // No github data — look up by card code + version from the in-memory index
                let issueData = getIssueByCardCode(newDoc.code, newDoc.version);
                if (!issueData && newDoc.release) {
                    const devCode = `${newDoc.project}${(newDoc.number + 500).toString().padStart(3, "0")}`;
                    issueData = getIssueByCardCode(devCode, newDoc.version);
                }
                if (issueData) {
                    newDoc._metadata = {
                        github: {
                            status: issueData.status,
                            issueUrl: issueData.issueUrl,
                            closedAt: issueData.closedAt ?? undefined,
                            lastSynced: now
                        }
                    };
                    newDoc.created = issueData.created;
                    newDoc.updated = issueData.created;
                    issueFound.push(`${newDoc.code} | ${newDoc.version}`);
                } else {
                    issueMissing.push(`${newDoc.code} | ${newDoc.version}`);
                }
            }

            if (!newDoc.created || !newDoc.updated) {
                unknownDates.push(`${newDoc.code} | ${newDoc.version}`);
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
            if (!newDoc.draft && (!latestMap[key] || compareSemver(newDoc.version, latestMap[key].version) > 0)) {
                latestMap[key] = { key: `${newDoc.project}-${newDoc.number}-${newDoc.version}`, version: newDoc.version };
            }

            docs.push(newDoc);
        }
        transformProgress.done(
            `done — ${issueMissing.length + issueFound.length > 0 ? `issue lookup: ${issueFound.length} found, ${issueMissing.length} not found` : "no issue lookups needed"}`
        );

        if (unknownDates.length > 0) {
            log.warn(`${unknownDates} cards could not have their created/updated dates resolved. Please investigate: ${unknownDates.join(", ")}`);
        }

        const latestKeys = new Set(Object.values(latestMap).map(v => v.key));
        for (const doc of docs) {
            if (latestKeys.has(`${doc.project}-${doc.number}-${doc.version}`)) doc.latest = true;
        }

        // === Discord forum thread lookup ===
        // Populate _metadata.discord.messageUrl for non-draft cards by matching
        // thread names in the card forum. Uses the same naming convention as the
        // live sync: "${number}. ${name} Preview" for 0.0.x cards, "${number}. ${name} ${version}" otherwise.
        // Draft cards are skipped — their messageUrl points to a message inside a thread,
        // not the thread starter, and cannot be reconstructed from thread metadata alone.
        log.info("Connecting to Discord to map card forum threads...");
        try {
            const threadMap = await fetchCardForumThreads();
            log.info(`Loaded ${threadMap.size} card forum thread(s)`);

            let discordMapped = 0, discordMissing = 0;
            for (const doc of docs) {
                if (doc.draft) continue;
                if (doc._metadata?.discord?.messageUrl) continue;

                const isPreview = doc.version?.startsWith("0.0.");
                const threadName = `${doc.number}. ${doc.name} (${isPreview ? "Preview" : doc.version})`;
                const thread = threadMap.get(threadName);

                if (thread) {
                    doc._metadata = { ...(doc._metadata ?? {}), discord: { messageUrl: thread.url, lastSynced: now } };
                    discordMapped++;
                } else {
                    discordMissing++;
                    log.verbose(`No Discord thread found for: "${threadName}"`);
                }
            }
            log.info(`Discord: ${discordMapped} URL(s) mapped, ${discordMissing} non-draft card(s) without a thread`);
        } catch (err) {
            log.warn(`Discord forum lookup failed — skipping Discord URL population: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (dryRun) {
            log.info(`[dry-run] Would upsert ${docs.length} transformed card(s) (match on project + number + version)`);
            log.info("[dry-run] Would drop and recreate unique index on { project, number, version }");
            return;
        }

        const saveProgress = createProgress("Saving");
        let upserted = 0, modified = 0;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            const ops = batch.map(doc => {
                const { created, ...restDoc } = doc;
                const setFields: Record<string, any> = { ...restDoc, updated: restDoc.updated ?? now };
                // created goes in $set only when we have real data; otherwise falls back to now via $setOnInsert
                const insertOnlyFields: Record<string, any> = { _id: new ObjectId(), createdBy: userId };
                if (created) {
                    setFields.created = created;
                } else {
                    insertOnlyFields.created = now;
                }
                return {
                    updateOne: {
                        filter: { project: doc.project, number: doc.number, version: doc.version },
                        update: {
                            $set: setFields,
                            $setOnInsert: insertOnlyFields
                        },
                        upsert: true
                    }
                };
            });
            const result = await dest.bulkWrite(ops as any, { ordered: false });
            upserted += result.upsertedCount;
            modified += result.modifiedCount;
            saveProgress.counter(upserted + modified, docs.length);
        }
        saveProgress.done("done");

        await dest.dropIndex("project_1_number_1_version_1").catch(() => undefined);
        await dest.createIndex({ project: 1, number: 1, version: 1 }, { unique: true });
        log.success(`Cards migration complete — ${upserted} inserted, ${modified} updated`);
    }
};