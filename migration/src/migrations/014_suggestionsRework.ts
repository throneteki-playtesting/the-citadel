import { AnyBulkWriteOperation, Document } from "mongodb";
import { Migration } from "../lib/types";
import { log, createProgress } from "../lib/logger";
import { deriveFields } from "../../../common/designGuidelines/deriveFields";

const BATCH_SIZE = 500;

const USED_FOR_PROJECT_REGEX = /^Used for (\S+) card #(\d+)$/;

export const migration: Migration = {
    name: "014_suggestionsRework",
    description:
        "Reshapes suggestions for the suggestions rework: adds draft/questions/derived/checklistJustifications/" +
        "pivotPoints/comparableCards/combosWith, drops tags and threadId, converts archivedReason (string) into a " +
        "structured archived object, and moves likedBy/approvedBy/approvedAt under _metadata.engagement as " +
        "Like/Dislike/Ignore reactions (normalizing any bare-discordId-array likedBy entries along the way)",

    async run({ destDb, dryRun }) {
        const collection = destDb.collection("suggestions");
        const docs = await collection.find({}).toArray();

        if (docs.length === 0) {
            log.info("Nothing to migrate");
            return;
        }

        const ops: AnyBulkWriteOperation<Document>[] = docs.map((doc) => {
            const set: Record<string, unknown> = {
                draft: true,
                questions: {
                    rewardTypes: [],
                    punishment: [],
                    abilityTypes: [],
                    triggerReliability: [],
                    repeatability: { hardLimit: false, paidCost: false, oneTime: false },
                    iconic: false
                },
                derived: deriveFields(doc.card?.text ?? ""),
                checklistJustifications: {},
                pivotPoints: [],
                comparableCards: [],
                combosWith: []
            };
            const unset: Record<string, string> = { tags: "", threadId: "" };

            if (typeof doc.archivedReason === "string") {
                const match = USED_FOR_PROJECT_REGEX.exec(doc.archivedReason);
                set.archived = match
                    ? {
                          reason: "usedInProject",
                          project: { code: match[1], number: Number(match[2]) },
                          archivedAt: doc.updated ?? new Date()
                      }
                    : {
                          reason: "other",
                          details: doc.archivedReason,
                          archivedAt: doc.updated ?? new Date()
                      };
                unset.archivedReason = "";
            }

            // likedBy was a bare discordId array before it grew a votedAt; either shape becomes a
            // "like" reaction here, since that was the only reaction type that existed before this.
            const likedBy = ((doc.likedBy ?? []) as unknown[]).map((entry) =>
                typeof entry === "string" ? { discordId: entry, votedAt: doc.updated ?? new Date() } : entry
            ) as { discordId: string; votedAt: Date }[];
            const engagement: Record<string, unknown> = {
                reactions: Object.fromEntries(
                    likedBy.map(({ discordId, votedAt }) => [discordId, { type: "like", reactedAt: votedAt }])
                )
            };
            if (doc.approvedBy) {
                engagement.approvedBy = doc.approvedBy;
                engagement.approvedAt = doc.approvedAt ?? doc.updated ?? new Date();
            }
            set["_metadata.engagement"] = engagement;
            Object.assign(unset, { likedBy: "", approvedBy: "", approvedAt: "" });

            return { updateOne: { filter: { _id: doc._id }, update: { $set: set, $unset: unset } } };
        });

        log.info(`${ops.length} suggestion document(s) will be migrated`);

        if (dryRun) {
            log.info(`[dry-run] Would update ${ops.length} document(s)`);
            return;
        }

        const progress = createProgress("suggestions");
        let done = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            await collection.bulkWrite(batch, { ordered: false });
            done += batch.length;
            progress.counter(done, ops.length);
        }
        progress.done(`${done} migrated`);

        log.success(`Suggestions rework migration complete - ${done} document(s) updated`);
    }
};
