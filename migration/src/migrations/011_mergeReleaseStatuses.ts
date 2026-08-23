import { Migration } from "../lib/types";
import { log } from "../lib/logger";

// "assembling" and "proofing" were merged into "approved" - reaching approved now implies the print
// sheet is assembled and proofed as part of that stage, rather than being tracked separately.
const RETIRED_STATUSES = ["assembling", "proofing"];

export const migration: Migration = {
    name: "011_mergeReleaseStatuses",
    description: "Remap releases stuck at the retired 'assembling'/'proofing' statuses onto 'approved'",

    async run({ destDb, dryRun }) {
        const projectsCol = destDb.collection("projects");

        const projects = await projectsCol
            .find({ "releases.status": { $in: RETIRED_STATUSES } })
            .toArray();
        log.info(`Found ${projects.length} project(s) with release(s) at a retired status`);

        for (const project of projects) {
            const affected = project.releases.filter((release: { status: string }) =>
                RETIRED_STATUSES.includes(release.status)
            );

            if (dryRun) {
                log.info(
                    `[dry-run] Would remap ${affected.length} release(s) to "approved" for project #${project.number}: ${affected.map((r: { code: string }) => r.code).join(", ")}`
                );
                continue;
            }

            await projectsCol.updateOne(
                { number: project.number },
                { $set: { "releases.$[release].status": "approved" } },
                { arrayFilters: [{ "release.status": { $in: RETIRED_STATUSES } }] }
            );
            log.success(
                `Remapped ${affected.length} release(s) to "approved" for project #${project.number}: ${affected.map((r: { code: string }) => r.code).join(", ")}`
            );
        }
    }
};
