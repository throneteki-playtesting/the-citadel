/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";
import { Migration } from "../lib/types";
import { log } from "../lib/logger";

const BATCH_SIZE = 500;
const userId = "120834530801221634";

export const migration: Migration = {
    name: "001_projects",
    description: "Copy & migrate projects from source to destination",

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
        const docs: Record<string, any>[] = [];

        log.info("Transforming...");
        for (const project of allProjects) {
            const newDoc: Record<string, any> = {
                ...project,
                _id: new ObjectId(),
                number: project.code,
                code: project.short,
                type: (project.type as string).toLowerCase(),
                version: project.releases,
                created: now,
                createdBy: userId,
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
                emoji: project.emoji ? (project.emoji as string).replaceAll(":", "") : ""
            };

            delete newDoc.short;
            delete newDoc.releases;
            delete newDoc.perFaction;
            delete newDoc.neutral;

            docs.push(newDoc);
        }

        if (dryRun) {
            log.info("[dry-run] Would drop dest \"projects\" collection");
            log.info(`[dry-run] Would insert ${docs.length} transformed project(s)`);
            log.info("[dry-run] Would create unique index on { number: 1 }");
            return;
        }

        log.info("Dropping destination collection...");
        await dest.drop().catch(() => { /* collection may not exist yet */ });

        log.info("Inserting transformed projects...");
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            await dest.insertMany(batch, { ordered: true });
            log.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${batch.length}`);
        }

        await dest.createIndex({ number: 1 }, { unique: true });
        log.success("Projects migration complete");
    }
};
