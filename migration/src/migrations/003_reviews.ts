/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log } from "../lib/logger";
import { resolveUsernameToId, fetchAllGuildMembers } from "../lib/discord";
import { writeUnresolvedUsers, getResolvedMappings } from "../lib/userMappings";

const BATCH_SIZE = 500;

export const migration: Migration = {
    name: "003_reviews",
    description: "Copy & migrate reviews from source to destination, resolving reviewer Discord usernames to IDs",

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

        let skipped = 0;
        const docs: Record<string, any>[] = [];

        log.info("Transforming reviews...");
        for (const review of allReviews) {
            const reviewerUsername = review.reviewer as string;
            const reviewerId = resolvedMap.get(reviewerUsername);

            if (!reviewerId) {
                skipped++;
                log.verbose(`Skipping review ${review._id} — reviewer "${reviewerUsername}" unresolved`);
                continue;
            }

            const newDoc: Record<string, any> = {
                ...review,
                _id: new ObjectId(),
                project: review.projectId,
                reviewer: reviewerId,
                created: new Date(Number(review.epoch)),
                createdBy: reviewerId,
                updated: new Date(Number(review.epoch)),
                updatedBy: reviewerId,
                statements: {
                    boring: (review.statements.boring as string).toLowerCase(),
                    competitive: (review.statements.competitive as string).toLowerCase(),
                    creative: (review.statements.creative as string).toLowerCase(),
                    balanced: (review.statements.balanced as string).toLowerCase(),
                    releasable: (review.statements.releasable as string).toLowerCase()
                }
            };

            delete newDoc.projectId;
            delete newDoc.epoch;
            delete newDoc.faction;
            delete newDoc.name;

            docs.push(newDoc);
        }

        if (dryRun) {
            log.info("[dry-run] Would drop dest \"reviews\" collection");
            log.info(`[dry-run] Would insert ${docs.length} transformed review(s) (${skipped} skipped — unresolved reviewers)`);
            if (skipped === 0) log.info("[dry-run] Would create unique index on { project, number, version, reviewer }");
            return;
        }

        if (docs.length === 0) {
            log.warn("No reviews to write after filtering — nothing committed");
            return;
        }

        log.info("Dropping destination collection...");
        await dest.drop().catch(() => { /* collection may not exist yet */ });

        log.info("Inserting transformed reviews...");
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            await dest.insertMany(batch, { ordered: true });
            log.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${batch.length}`);
        }

        if (skipped === 0) {
            await dest.createIndex({ project: 1, number: 1, version: 1, reviewer: 1 }, { unique: true });
        }

        log.success(`Reviews migration complete (${docs.length} written, ${skipped} skipped)`);
    }
};
