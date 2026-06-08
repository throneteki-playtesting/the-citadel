/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log } from "../lib/logger";

const BATCH_SIZE = 500;
const userId = "120834530801221634";

export const migration: Migration = {
    name: "001_projects",
    description: "Upsert migrated projects into destination (match on number)",

    async run({ sourceDb, destDb, dryRun }) {
        const source = sourceDb.collection("projects");
        const dest = destDb.collection("projects");

        log.info("Fetching projects from source...");
        const allProjects = await source.find({}).toArray();
        log.info(`Found ${allProjects.length} projects`);

        if (allProjects.length === 0) {
            log.warn("No projects found in source — skipping");
            return;
        }

        const now = new Date();
        const ops: object[] = [];

        log.info("Transforming...");
        for (const project of allProjects) {
            const newDoc: Record<string, any> = {
                number: project.code,
                code: project.short,
                type: (project.type as string).toLowerCase(),
                version: project.releases,
                updated: now,
                updatedBy: userId,
                draft: !project.active,
                cardCount: {
                    baratheon: project.perFaction,
                    greyjoy: project.perFaction,
                    lannister: project.perFaction,
                    martell: project.perFaction,
                    thenightswatch: project.perFaction,
                    stark: project.perFaction,
                    targaryen: project.perFaction,
                    tyrell: project.perFaction,
                    neutral: project.neutral
                },
                emoji: project.emoji ? (project.emoji as string).replaceAll(":", "") : "",
                // Carry through any remaining fields not explicitly remapped
                ...(project.active !== undefined && { active: project.active }),
                ...(project.name && { name: project.name })
            };

            ops.push({
                updateOne: {
                    filter: { number: newDoc.number },
                    update: {
                        $set: newDoc,
                        $setOnInsert: { _id: new ObjectId(), created: now, createdBy: userId }
                    },
                    upsert: true
                }
            });
        }

        if (dryRun) {
            log.info(`[dry-run] Would upsert ${ops.length} project(s) into dest (match on number)`);
            log.info("[dry-run] Would create unique index on { number: 1 }");
            return;
        }

        // Ensure index exists before upserting
        await dest.createIndex({ number: 1 }, { unique: true });

        let upserted = 0, modified = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            const result = await dest.bulkWrite(batch as any, { ordered: false });
            upserted += result.upsertedCount;
            modified += result.modifiedCount;
            log.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
        }

        log.success(`Projects migration complete — ${upserted} inserted, ${modified} updated`);
    }
};
