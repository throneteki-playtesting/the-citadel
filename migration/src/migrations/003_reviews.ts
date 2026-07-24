/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log } from "../lib/logger";
import { resolveUsernameToId, fetchAllGuildMembers, fetchForumThreads, getDisplayNamesFor, ForumThread } from "../lib/discord";
import { writeUnresolvedUsers, getResolvedMappings } from "../lib/userMappings";
import { normalizeDeckLink } from "../lib/deckLinks";

const BATCH_SIZE = 500;

export const migration: Migration = {
    name: "003_reviews",
    description: "Upsert migrated reviews into destination (match on project + number + version + reviewer)",

    async run({ sourceDb, destDb, dryRun }) {
        const source = sourceDb.collection("reviews");
        const dest = destDb.collection("reviews");

        log.info("Fetching reviews from source...");
        const allReviews = await source.find({ projectId: { $exists: true } }).toArray();
        log.info(`Found ${allReviews.length} reviews`);

        if (allReviews.length === 0) {
            log.warn("No reviews found in source — skipping");
            return;
        }

        log.info("Fetching Discord guild members...");
        await fetchAllGuildMembers();

        const manualMappings = getResolvedMappings();
        if (Object.keys(manualMappings).length > 0) {
            log.info(`Loaded ${Object.keys(manualMappings).length} manual user mapping(s)`);
        }

        const uniqueReviewers = [...new Set(allReviews.map(r => r.reviewer as string))];
        log.info(`Resolving ${uniqueReviewers.length} unique reviewer(s)...`);

        const resolvedMap = new Map<string, string>();
        const unresolved: string[] = [];

        for (const username of uniqueReviewers) {
            if (manualMappings[username]) {
                resolvedMap.set(username, manualMappings[username]);
                log.verbose(`"${username}" resolved via manual mapping`);
                continue;
            }

            const id = await resolveUsernameToId(username);
            if (id) {
                resolvedMap.set(username, id);
                log.verbose(`"${username}" resolved to ${id}`);
            } else {
                unresolved.push(username);
                log.warn(`Could not resolve reviewer: "${username}"`);
            }
        }

        if (unresolved.length > 0) {
            writeUnresolvedUsers(unresolved);
            log.warn(`\n${unresolved.length} reviewer(s) could not be resolved — see unresolved-users.json`);
            log.info("Fill in the Discord IDs and re-run with --resolve-users");
        }

        if (resolvedMap.size === 0) {
            log.warn("No reviewers could be resolved — aborting reviews migration");
            return;
        }

        // Fetch card names from already-migrated destination cards for thread name matching
        const cardNameMap = new Map<string, string>();
        const destCards = await destDb.collection("cards")
            .find({}, { projection: { project: 1, number: 1, version: 1, name: 1 } })
            .toArray();
        for (const card of destCards) {
            cardNameMap.set(`${card.project}-${card.number}-${card.version}`, card.name as string);
        }
        log.info(`Loaded ${cardNameMap.size} card name(s) for Discord thread matching`);

        // Fetch review forum threads for _metadata.discord population
        log.info("Connecting to Discord to map review forum threads...");
        let threadMap = new Map<string, ForumThread>();
        try {
            threadMap = await fetchForumThreads("playtesting-reviews");
            log.info(`Loaded ${threadMap.size} review forum thread(s)`);
        } catch (err) {
            log.warn(`Discord review forum lookup failed — skipping Discord URL population: ${err instanceof Error ? err.message : String(err)}`);
        }

        let skipped = 0;
        const ops: object[] = [];
        for (const review of allReviews) {
            const reviewerUsername = review.reviewer as string;
            const reviewerId = resolvedMap.get(reviewerUsername);

            if (!reviewerId) {
                skipped++;
                log.verbose(`Skipping review ${review._id} — reviewer "${reviewerUsername}" unresolved`);
                continue;
            }

            const created = new Date(Number(review.epoch));

            const setDoc: Record<string, any> = {
                project: review.projectId,
                number: review.number,
                version: review.version,
                reviewer: reviewerId,
                updated: created,
                updatedBy: reviewerId,
                statements: {
                    boring: (review.statements.boring as string).toLowerCase(),
                    competitive: (review.statements.competitive as string).toLowerCase(),
                    creative: (review.statements.creative as string).toLowerCase(),
                    balanced: (review.statements.balanced as string).toLowerCase(),
                    releasable: (review.statements.releasable as string).toLowerCase()
                },
                // Source decks are raw link strings - defaults to shared for all pre-existing links
                decks: (review.decks as string[] ?? []).map((link) => ({ link: normalizeDeckLink(link), shared: true }))
            };

            // Carry through any other fields not explicitly remapped
            for (const [k, v] of Object.entries(review)) {
                if (!["_id", "projectId", "epoch", "faction", "name", "reviewer", "statements", "decks"].includes(k)) {
                    if (k === "discord") {
                        // Remap old root-level discord to _metadata
                        if (v) setDoc._metadata = { ...(setDoc._metadata ?? {}), discord: v };
                    } else if (!(k in setDoc)) {
                        setDoc[k] = v;
                    }
                }
            }

            // Discord review thread lookup
            if (!setDoc._metadata?.discord?.messageUrl && threadMap.size > 0) {
                const cardKey = `${setDoc.project}-${setDoc.number}-${setDoc.version}`;
                const cardName = cardNameMap.get(cardKey);
                if (cardName) {
                    const isPreview = (setDoc.version as string)?.startsWith("0.0.");
                    const versionLabel = isPreview ? "Preview" : setDoc.version;
                    const displayNames = getDisplayNamesFor(reviewerId);
                    for (const displayName of displayNames) {
                        const threadName = `${setDoc.number} | ${cardName} (${versionLabel}) - ${displayName}`;
                        const thread = threadMap.get(threadName);
                        if (thread) {
                            const lastSynced = thread.createdAt < setDoc.updated ? thread.createdAt : setDoc.updated;
                            setDoc._metadata = { ...(setDoc._metadata ?? {}), discord: { messageUrl: thread.url, lastSynced } };
                            break;
                        }
                    }
                }
            }

            ops.push({
                updateOne: {
                    filter: {
                        project: review.projectId,
                        number: review.number,
                        version: review.version,
                        reviewer: reviewerId
                    },
                    update: {
                        $set: setDoc,
                        $setOnInsert: { _id: new ObjectId(), created, createdBy: reviewerId }
                    },
                    upsert: true
                }
            });
        }

        if (dryRun) {
            log.info(`[dry-run] Would upsert ${ops.length} review(s) into dest (match on project + number + version + reviewer)`);
            log.info(`[dry-run] ${skipped} review(s) skipped (unresolved reviewers)`);
            log.info("[dry-run] Would create unique index on { project, number, version, reviewer }");
            return;
        }

        if (ops.length === 0) {
            log.warn("No reviews to write after filtering — nothing committed");
            return;
        }

        let upserted = 0, modified = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            const result = await dest.bulkWrite(batch as any, { ordered: false });
            upserted += result.upsertedCount;
            modified += result.modifiedCount;
            log.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
        }

        await dest.dropIndex("project_1_number_1_version_1_reviewer_1").catch(() => undefined);
        await dest.createIndex({ project: 1, number: 1, version: 1, reviewer: 1 }, { unique: true });
        log.success(`Reviews migration complete — ${upserted} inserted, ${modified} updated, ${skipped} skipped`);
    }
};
