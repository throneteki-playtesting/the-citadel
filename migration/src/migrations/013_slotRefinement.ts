import { AnyBulkWriteOperation, Document } from "mongodb";
import { Migration } from "../lib/types";
import { log } from "../lib/logger";

// Release checks (taken during development) and refinement checks (once design is locked in) share the
// same shape and one-per-person rule, so they group under one key rather than sitting as unrelated siblings.
export const migration: Migration = {
    name: "013_slotRefinement",
    description: "Group design checks under checks.release/.refinement and seed the refinement step's fields",

    async run({ destDb, dryRun }) {
        const slotsCol = destDb.collection("slots");

        // Selected by the absence of the grouped key, not by the old shape's type: $type reaches into
        // arrays and matches elements, so asking whether checks is an object still says "yes" for an old array.
        const slots = await slotsCol.find({ "statuses.design.checks.release": { $exists: false } }).toArray();
        log.info(`Found ${slots.length} slot(s) still holding the old design.checks shape`);

        if (slots.length === 0) {
            return;
        }

        const byProject = new Map<number, number>();
        const operations: AnyBulkWriteOperation<Document>[] = slots.map((slot) => {
            const existing = slot.statuses?.design?.checks;
            byProject.set(slot.project, (byProject.get(slot.project) ?? 0) + 1);

            return {
                updateOne: {
                    filter: { project: slot.project, number: slot.number },
                    update: {
                        $set: {
                            "statuses.design.checks": {
                                release: Array.isArray(existing) ? existing : [],
                                refinement: []
                            },
                            "statuses.design.inquiries": []
                        }
                    }
                }
            };
        });

        for (const [project, count] of [...byProject].sort(([a], [b]) => a - b)) {
            log.info(`${dryRun ? "[dry-run] Would convert" : "Converting"} ${count} slot(s) for project #${project}`);
        }

        if (dryRun) {
            return;
        }

        const result = await slotsCol.bulkWrite(operations);
        log.success(`Converted ${result.modifiedCount} slot(s) to the grouped checks shape`);
    }
};
