/* eslint-disable @typescript-eslint/no-explicit-any */
import { Collection } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";

const BATCH_SIZE = 500;

/**
 * Moves root-level sync fields into the _metadata sub-document.
 * Only moves a field if _metadata doesn't already have it (new code may
 * have already written _metadata on some documents before this migration runs).
 * Returns the count of documents updated.
 */
async function migrateMetadataFields(
    col: Collection,
    label: string,
    metadataFields: string[],
    dryRun: boolean
): Promise<number> {
    const filter = { $or: metadataFields.map(f => ({ [f]: { $exists: true } })) };
    const docs = await col.find(filter).toArray();

    if (docs.length === 0) {
        log.info(`${label}: nothing to migrate`);
        return 0;
    }

    if (dryRun) {
        log.info(`${label}: [dry-run] would migrate ${docs.length} document(s)`);
        for (const doc of docs.slice(0, 3)) {
            const fields = metadataFields.filter(f => doc[f] !== undefined);
            log.verbose(`  would move { ${fields.join(", ")} } → _metadata for _id ${doc._id}`);
        }
        if (docs.length > 3) log.verbose(`  ... and ${docs.length - 3} more`);
        return docs.length;
    }

    const ops: object[] = [];
    for (const doc of docs) {
        const newMetadata: Record<string, any> = { ...(doc._metadata ?? {}) };
        const toUnset: Record<string, string> = {};

        for (const field of metadataFields) {
            if (doc[field] !== undefined) {
                // Only migrate if _metadata doesn't already have this field
                // (new code may have written it after deployment)
                if (newMetadata[field] === undefined) {
                    newMetadata[field] = doc[field];
                }
                toUnset[field] = "";
            }
        }

        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: {
                    $set: { _metadata: newMetadata },
                    $unset: toUnset
                }
            }
        });
    }

    const progress = createProgress(label);
    let done = 0;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
        const batch = ops.slice(i, i + BATCH_SIZE);
        await col.bulkWrite(batch as any, { ordered: false });
        done += batch.length;
        progress.counter(done, ops.length);
    }
    progress.done(`${done} migrated`);
    return done;
}

export const migration: Migration = {
    name: "005_metadata",
    description: "Move root-level github/discord/cardUpdated fields into _metadata sub-document",

    async run({ destDb, dryRun }) {
        const cardsCol = destDb.collection("cards");
        const reviewsCol = destDb.collection("reviews");
        const playtestingUpdatesCol = destDb.collection("playtestingUpdates");
        const suggestionsCol = destDb.collection("suggestions");

        let total = 0;

        // Cards: github + discord + imageUrl → _metadata; cardUpdated → deleted
        total += await migrateMetadataFields(cardsCol, "cards", ["github", "discord", "imageUrl"], dryRun);

        const cardUpdatedCount = await cardsCol.countDocuments({ cardUpdated: { $exists: true } });
        if (cardUpdatedCount > 0) {
            if (dryRun) {
                log.info(`cards: [dry-run] would remove cardUpdated from ${cardUpdatedCount} document(s)`);
            } else {
                const result = await cardsCol.updateMany({ cardUpdated: { $exists: true } }, { $unset: { cardUpdated: "" } });
                log.info(`cards: removed cardUpdated from ${result.modifiedCount} document(s)`);
            }
        }

        // Reviews: discord → _metadata
        total += await migrateMetadataFields(reviewsCol, "reviews", ["discord"], dryRun);

        // PlaytestingUpdates: github → _metadata.github.code (nested under code, not flat)
        {
            const docs = await playtestingUpdatesCol.find({ github: { $exists: true } }).toArray();
            if (docs.length === 0) {
                log.info("playtestingUpdates: nothing to migrate");
            } else if (dryRun) {
                log.info(`playtestingUpdates: [dry-run] would migrate ${docs.length} document(s)`);
            } else {
                const ops: object[] = [];
                for (const doc of docs) {
                    const existingMeta = doc._metadata ?? {};
                    const newMeta = {
                        ...existingMeta,
                        github: {
                            ...(existingMeta.github ?? {}),
                            code: existingMeta.github?.code ?? doc.github
                        }
                    };
                    ops.push({
                        updateOne: {
                            filter: { _id: doc._id },
                            update: { $set: { _metadata: newMeta }, $unset: { github: "" } }
                        }
                    });
                }
                const progress = createProgress("playtestingUpdates");
                let done = 0;
                for (let i = 0; i < ops.length; i += BATCH_SIZE) {
                    const batch = ops.slice(i, i + BATCH_SIZE);
                    await playtestingUpdatesCol.bulkWrite(batch as any, { ordered: false });
                    done += batch.length;
                    progress.counter(done, ops.length);
                }
                progress.done(`${done} migrated`);
                total += done;
            }
        }

        // Suggestions: discord → _metadata
        total += await migrateMetadataFields(suggestionsCol, "suggestions", ["discord"], dryRun);

        if (!dryRun) {
            await suggestionsCol.dropIndex("id_1").catch(() => undefined);
            await suggestionsCol.createIndex({ id: 1 }, { unique: true });
        }

        if (dryRun) {
            log.info(`[dry-run] ${total} total document(s) would be migrated`);
        } else {
            log.success(`Metadata migration complete — ${total} document(s) migrated`);
        }
    }
};
