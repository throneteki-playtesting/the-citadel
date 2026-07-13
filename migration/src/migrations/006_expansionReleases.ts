/* eslint-disable @typescript-eslint/no-explicit-any */
import { Migration } from "../lib/types";
import { log } from "../lib/logger";

const userId = "120834530801221634";

// Canonical faction order - matches common/models/cards factions
const factions = ["baratheon", "greyjoy", "lannister", "martell", "thenightswatch", "stark", "targaryen", "tyrell", "neutral"];

export const migration: Migration = {
    name: "006_expansionReleases",
    description: "Seed the single fixed release (with slot position assignments) for initialised expansion projects that lack one",

    async run({ destDb, dryRun }) {
        const projectsCol = destDb.collection("projects");
        const slotsCol = destDb.collection("slots");

        const projects = await projectsCol.find({
            type: "expansion",
            draft: false,
            $or: [{ releases: { $size: 0 } }, { releases: { $exists: false } }]
        }).toArray();
        log.info(`Found ${projects.length} initialised expansion project(s) without a release`);

        for (const project of projects) {
            const slots = await slotsCol.find({ project: project.number }).toArray();

            const allocations = factions
                .map((faction) => ({ faction, count: slots.filter((slot: any) => slot.faction === faction).length }))
                .filter((allocation) => allocation.count > 0);
            const capacity = allocations.reduce((sum, allocation) => sum + allocation.count, 0);

            const now = new Date();
            const release = {
                code: project.code,
                name: project.name,
                number: 1,
                capacity,
                slots: allocations,
                status: "planning",
                created: now,
                createdBy: userId,
                updated: now,
                updatedBy: userId
            };

            let position = 1;
            const slotOps: object[] = [];
            for (const { faction } of allocations) {
                const factionSlots = slots.filter((slot: any) => slot.faction === faction).sort((a: any, b: any) => a.number - b.number);
                for (const slot of factionSlots) {
                    slotOps.push({
                        updateOne: {
                            filter: { project: project.number, number: slot.number },
                            update: { $set: { release: { code: release.code, position: position++ } } }
                        }
                    });
                }
            }

            if (dryRun) {
                log.info(`[dry-run] Would seed release "${release.code}" (${capacity} slots) for project #${project.number} and assign ${slotOps.length} slot position(s)`);
                continue;
            }

            await projectsCol.updateOne({ number: project.number }, { $set: { releases: [release] } });
            if (slotOps.length > 0) {
                await slotsCol.bulkWrite(slotOps as any, { ordered: false });
            }
            log.success(`Seeded release "${release.code}" for project #${project.number} - ${slotOps.length} slot(s) assigned`);
        }
    }
};
