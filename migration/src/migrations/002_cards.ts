/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { loadAllIssues, getIssueByNumber, getIssueByCardCode, parseIssueNumber } from "../lib/github";
import { fetchCardForumThreads } from "../lib/discord";

const BATCH_SIZE = 500;
const userId = "120834530801221634";

const releasePackData: Record<string, { name: string, released: Date }> = {
    WAID: {
        name: "When All Is Darkest",
        released: new Date("2025-05-18")
    },
    WoW: {
        name: "Whispers of War",
        released: new Date("2025-07-02")
    },
    MaV: {
        name: "Mountain and Vale",
        released: new Date("2025-08-24")
    },
    LotW: {
        name: "Lord of the Waters",
        released: new Date("2025-10-03")
    },
    JfE: {
        name: "Justice for Elia",
        released: new Date("2025-12-07")
    },
    NCbT: {
        name: "No Crown but Truth",
        released: new Date("2026-02-07")
    }
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

function generateReleaseImageUrl(short: string, number: number, name: string) {
    const safeName = name.replace(/[<>:"/\\|?*']/g, "").replace(/\s/g, "_");
    return encodeURI(`https://throneteki.ams3.cdn.digitaloceanspaces.com/packs/${short}/${number}_${safeName}.png`);
}

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
                implemented: card.playtesting && (card.github?.status === "complete"),
                updatedBy: userId,
                _metadata: {}
            };

            if (newDoc.release) {
                newDoc.code = `${newDoc.project}${newDoc.release.number.toString().padStart(3, "0")}`;
                const releaseData = releasePackData[newDoc.release.short];
                if (releaseData) {
                    newDoc.created = releaseData.released;
                    newDoc.updated = releaseData.released;
                }
            } else {
                newDoc.code = `${newDoc.project}${(newDoc.number + 500).toString().padStart(3, "0")}`;
            }

            const rawGithub = newDoc.github;
            delete newDoc.github;

            if (newDoc.imageUrl) {
                newDoc._metadata.imageUrl = newDoc.imageUrl;
                delete newDoc.imageUrl;
            } else if (newDoc.release) {
                const newImageUrl = generateReleaseImageUrl(newDoc.release.short, newDoc.release.number, newDoc.name);
                newDoc._metadata.imageUrl = newImageUrl;
            }

            if (rawGithub?.issueUrl) {
                // Card already has github data — refresh from in-memory index by issue number
                const issueNumber = parseIssueNumber(rawGithub.issueUrl);
                const issueData = issueNumber !== null ? getIssueByNumber(issueNumber) : null;

                if (issueData) {
                    newDoc._metadata.github = {
                        status: issueData.status,
                        issueUrl: issueData.issueUrl,
                        closedAt: issueData.closedAt ?? undefined,
                        lastSynced: now
                    };
                    newDoc.created = issueData.created;
                    newDoc.updated = issueData.created;
                } else {
                    // Issue not found in index — normalise what we have
                    if (rawGithub.status === "complete") rawGithub.status = "closed";
                    if (rawGithub.status === "closed") rawGithub.closedAt = now;
                    rawGithub.lastSynced = now;
                    newDoc._metadata.github = rawGithub;
                }
            } else {
                // No github data — look up by card code + version from the in-memory index
                let issueData = getIssueByCardCode(newDoc.code, newDoc.version);
                if (!issueData && newDoc.release) {
                    const devCode = `${newDoc.project}${(newDoc.number + 500).toString().padStart(3, "0")}`;
                    issueData = getIssueByCardCode(devCode, newDoc.version);
                }
                if (issueData) {
                    newDoc._metadata.github = {
                        status: issueData.status,
                        issueUrl: issueData.issueUrl,
                        closedAt: issueData.closedAt ?? undefined,
                        lastSynced: now
                    };
                    newDoc.created = issueData.created;
                    newDoc.updated = issueData.created;
                    issueFound.push(`${newDoc.code} | ${newDoc.version}`);
                } else {
                    issueMissing.push(`${newDoc.code} | ${newDoc.version}`);
                }
            }

            // Manually assume implemented if github issue is closed
            if (newDoc._metadata.github?.status === "closed") {
                newDoc.implemented = true;
            }

            if (!newDoc.created || !newDoc.updated) {
                unknownDates.push(`${newDoc.code} | ${newDoc.version}`);
            }

            if (newDoc.faction && factionMap[newDoc.faction]) newDoc.faction = factionMap[newDoc.faction];
            if (newDoc.type) newDoc.type = (newDoc.type as string).toLowerCase();
            if (newDoc.note?.type) newDoc.note.type = (newDoc.note.type as string).toLowerCase();
            if (newDoc.text) newDoc.text = (newDoc.text as string).replace(/\r/g, "");

            if (newDoc.note?.type === "implemented") delete newDoc.note;

            delete newDoc._id;
            delete newDoc.projectId;
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
                    doc._metadata.discord = { messageUrl: thread.url, lastSynced: now };
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

        // Wipe metadata if its empty
        for (const doc of docs) {
            if (Object.keys(doc._metadata).length === 0) delete doc._metadata;
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
            // Full replace so fields absent from the source (e.g. note) don't linger from earlier runs.
            // Docs without a source counterpart are never matched, so they stay untouched;
            // created/createdBy carry over from the existing doc when the source has no real date.
            const existing = await dest.find(
                { $or: batch.map(doc => ({ project: doc.project, number: doc.number, version: doc.version })) },
                { projection: { project: 1, number: 1, version: 1, created: 1, createdBy: 1 } }
            ).toArray();
            const existingMap = new Map(existing.map((e: any) => [`${e.project}|${e.number}|${e.version}`, e]));
            const ops = batch.map(doc => {
                // position within the pack moves to the slots collection (derived below) - only the
                // permanent stamp of what actually shipped stays on the card itself, see IPlaytestCard.released
                const { created, release, ...restDoc } = doc;
                const current = existingMap.get(`${doc.project}|${doc.number}|${doc.version}`);
                const replacement: Record<string, any> = {
                    ...restDoc,
                    updated: restDoc.updated ?? now,
                    ...(release && { released: { code: release.short, number: release.number } }),
                    created: created ?? current?.created ?? now,
                    createdBy: current?.createdBy ?? userId
                };
                return {
                    replaceOne: {
                        filter: { project: doc.project, number: doc.number, version: doc.version },
                        replacement,
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

        // === Slots & Releases derivation ===
        // Release info moves from card.release to a dedicated slots collection, with the printed
        // number derived from (release sequence + capacity offset) rather than stored directly.
        // Draft projects are skipped entirely - they get slots later via the +/- editor.
        log.info("Deriving slots & releases from migrated cards...");

        const projectsDest = destDb.collection("projects");
        const slotsDest = destDb.collection("slots");
        const allFactions = ["baratheon", "greyjoy", "lannister", "martell", "thenightswatch", "stark", "targaryen", "tyrell", "neutral"];

        const draftProjectNumbers = new Set(
            (await projectsDest.find({ draft: true }, { projection: { number: 1 } }).toArray()).map((p: any) => p.number)
        );

        type SlotDraft = { project: number; number: number; faction: string; release?: { short: string; number: number } };
        const bySlotKey = new Map<string, SlotDraft>();

        for (const doc of docs) {
            if (draftProjectNumbers.has(doc.project)) continue;
            const key = `${doc.project}|${doc.number}`;
            const existing = bySlotKey.get(key);
            // Prefer whichever version actually carries the historical release info
            if (!existing || (doc.release && !existing.release)) {
                bySlotKey.set(key, { project: doc.project, number: doc.number, faction: doc.faction, release: doc.release });
            }
        }

        // Determine each project's release sequence from the lowest absolute printed number seen per pack code,
        // and its ordered faction slot allocations from the factions of its cards in printed order
        const releaseInfoByProject = new Map<number, Map<string, { minNumber: number; cards: { number: number; faction: string }[] }>>();
        for (const slot of bySlotKey.values()) {
            if (!slot.release) continue;
            const projectMap = releaseInfoByProject.get(slot.project) ?? new Map();
            const entry = projectMap.get(slot.release.short) ?? { minNumber: Infinity, cards: [] };
            entry.minNumber = Math.min(entry.minNumber, slot.release.number);
            entry.cards.push({ number: slot.release.number, faction: slot.faction });
            projectMap.set(slot.release.short, entry);
            releaseInfoByProject.set(slot.project, projectMap);
        }

        const releaseDocsByProject = new Map<number, Record<string, any>[]>();
        for (const [project, codes] of releaseInfoByProject) {
            const ordered = [...codes.entries()].sort((a, b) => a[1].minNumber - b[1].minNumber);
            releaseDocsByProject.set(project, ordered.map(([code, { cards }], index) => {
                const releaseData = releasePackData[code];
                const name = releaseData?.name ?? code;
                const releasedDate = releaseData?.released.toISOString().split("T")[0] ?? undefined;
                const slots: { faction: string; count: number }[] = [];
                for (const card of [...cards].sort((a, b) => a.number - b.number)) {
                    const allocation = slots.find((s) => s.faction === card.faction);
                    if (allocation) {
                        allocation.count += 1;
                    } else {
                        slots.push({ faction: card.faction, count: 1 });
                    }
                }
                return {
                    code,
                    name,
                    number: index + 1,
                    capacity: cards.length,
                    slots,
                    status: "released",
                    releasedDate,
                    created: releasedDate ?? now,
                    createdBy: userId,
                    updated: releasedDate ?? now,
                    updatedBy: userId
                };}
            ));
        }

        function offsetFor(project: number, code: string): number {
            const releases = releaseDocsByProject.get(project) ?? [];
            const target = releases.find((r) => r.code === code);
            return target ? releases.filter((r) => r.number < target.number).reduce((sum, r) => sum + r.capacity, 0) : 0;
        }

        const slotDocs = [...bySlotKey.values()].map((slot) => ({
            project: slot.project,
            number: slot.number,
            faction: slot.faction,
            statuses: slot.release
                ? { development: "ready", wording: "approved", artwork: "approved", production: "filed" }
                : { development: "designing", wording: "pending", artwork: "pending", production: "pending" },
            ...(slot.release && {
                release: {
                    code: slot.release.short,
                    position: slot.release.number - offsetFor(slot.project, slot.release.short),
                    released: !!releasePackData[slot.release.short]
                }
            }),
            created: now,
            createdBy: userId,
            updated: now,
            updatedBy: userId
        }));

        const cardCountByProject = new Map<number, Record<string, number>>();
        for (const slot of bySlotKey.values()) {
            const counts = cardCountByProject.get(slot.project) ?? Object.fromEntries(allFactions.map((f) => [f, 0]));
            counts[slot.faction] = (counts[slot.faction] ?? 0) + 1;
            cardCountByProject.set(slot.project, counts);
        }

        if (dryRun) {
            log.info(`[dry-run] Would create ${slotDocs.length} slot(s) across ${cardCountByProject.size} non-draft project(s)`);
            log.info(`[dry-run] Would set releases for ${releaseDocsByProject.size} project(s)`);
        } else {
            if (slotDocs.length > 0) {
                const slotOps = slotDocs.map((slot) => ({
                    updateOne: {
                        filter: { project: slot.project, number: slot.number },
                        update: { $set: slot, $setOnInsert: { _id: new ObjectId() } },
                        upsert: true
                    }
                }));
                for (let i = 0; i < slotOps.length; i += BATCH_SIZE) {
                    await slotsDest.bulkWrite(slotOps.slice(i, i + BATCH_SIZE) as any, { ordered: false });
                }
                await slotsDest.dropIndex("project_1_number_1").catch(() => undefined);
                await slotsDest.createIndex({ project: 1, number: 1 }, { unique: true });
                log.success(`Created/updated ${slotDocs.length} slot(s)`);
            }

            for (const [project, counts] of cardCountByProject) {
                await projectsDest.updateOne(
                    { number: project },
                    { $set: { cardCount: counts, releases: releaseDocsByProject.get(project) ?? [] } }
                );
            }
            log.success(`Updated cardCount/releases for ${cardCountByProject.size} project(s)`);
        }
    }
};