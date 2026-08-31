import { Migration } from "../lib/types";
import { log } from "../lib/logger";

// The data-PR sync permission moved from playtesting-update-scoped to project-scoped, so its name
// follows - renamed on both the "roles" collection and its denormalized copy on "users".
const OLD_PERMISSION = "SYNC_PLAYTESTINGUPDATE_GITHUB_DATA";
const NEW_PERMISSION = "SYNC_PROJECT_GITHUB_DATA";

export const migration: Migration = {
    name: "012_renameProjectDataSyncPermission",
    description: `Rename the "${OLD_PERMISSION}" permission to "${NEW_PERMISSION}" on roles and users`,

    async run({ destDb, dryRun }) {
        for (const collectionName of ["roles", "users"]) {
            const collection = destDb.collection(collectionName);
            const matches = await collection.find({ permissions: OLD_PERMISSION }).toArray();
            log.info(`Found ${matches.length} document(s) in "${collectionName}" with the old permission`);

            if (matches.length === 0) {
                continue;
            }

            if (dryRun) {
                log.info(
                    `[dry-run] Would rename permission for ${collectionName}: ${matches.map((m) => m.discordId ?? m._id).join(", ")}`
                );
                continue;
            }

            await collection.updateMany(
                { permissions: OLD_PERMISSION },
                { $set: { "permissions.$[permission]": NEW_PERMISSION } },
                { arrayFilters: [{ permission: OLD_PERMISSION }] }
            );
            log.success(`Renamed permission on ${matches.length} document(s) in "${collectionName}"`);
        }
    }
};
