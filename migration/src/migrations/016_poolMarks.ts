import { AnyBulkWriteOperation, Document } from "mongodb";
import { Migration } from "../lib/types";
import { log } from "../lib/logger";

// A pool entry was one person's doing (`addedBy`/`added`) - it is now a list of marks, one per person
export const migration: Migration = {
    name: "016_poolMarks",
    description: "Turn each project pool entry's addedBy/added into a one-mark adds list",

    async run({ destDb, dryRun }) {
        const pools = destDb.collection("projectPools");
        const entries = await pools.find({ adds: { $exists: false }, addedBy: { $exists: true } }).toArray();
        log.info(`Found ${entries.length} pool entr${entries.length === 1 ? "y" : "ies"} to convert`);
        if (entries.length === 0 || dryRun) {
            return;
        }

        const operations: AnyBulkWriteOperation<Document>[] = entries.map((entry) => ({
            updateOne: {
                filter: { _id: entry._id },
                update: {
                    $set: { adds: [{ user: entry.addedBy, added: entry.added }] },
                    $unset: { addedBy: "", added: "" }
                }
            }
        }));
        const result = await pools.bulkWrite(operations);
        log.success(`Converted ${result.modifiedCount} pool entr${result.modifiedCount === 1 ? "y" : "ies"}`);
    }
};
