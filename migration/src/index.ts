import "dotenv/config";
import { MongoClient } from "mongodb";
import { log } from "./lib/logger";
import { getAppliedMigrations, markMigrationApplied } from "./lib/migrationRegistry";
import { destroyDiscordClient } from "./lib/discord";
import { hasUnresolvedMappings } from "./lib/userMappings";
import { MigrationContext, Migration } from "./lib/types";
import { getArgValue } from "./lib/args";
import { ENVIRONMENTS, isEnvironment, resolveDatabase } from "./lib/environments";

import { migration as projectsMigration } from "./migrations/001_projects";
import { migration as cardsMigration } from "./migrations/002_cards";
import { migration as reviewsMigration } from "./migrations/003_reviews";
import { migration as playtestingUpdatesMigration } from "./migrations/004_playtestingUpdates";
import { migration as metadataMigration } from "./migrations/005_metadata";
import { migration as expansionReleasesMigration } from "./migrations/006_expansionReleases";
import { migration as reviewDeckShapeMigration } from "./migrations/007_reviewDeckShape";
import { migration as decksMigration } from "./migrations/008_decks";
import { migration as slotDesignLaneMigration } from "./migrations/009_slotDesignLane";
import { migration as richTextMigration } from "./migrations/010_richText";
import { migration as mergeReleaseStatusesMigration } from "./migrations/011_mergeReleaseStatuses";

const ALL_MIGRATIONS: Migration[] = [
    projectsMigration,
    cardsMigration,
    reviewsMigration,
    playtestingUpdatesMigration,
    metadataMigration,
    expansionReleasesMigration,
    reviewDeckShapeMigration,
    decksMigration,
    slotDesignLaneMigration,
    richTextMigration,
    mergeReleaseStatusesMigration
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const resolveUsersOnly = args.includes("--resolve-users");

async function main() {
    const environmentArg = getArgValue(args, "environment");
    if (!environmentArg || !isEnvironment(environmentArg)) {
        log.error(`--environment is required and must be one of: ${ENVIRONMENTS.join(", ")}`);
        return process.exit(1);
    }

    const fromEnvironmentArg = getArgValue(args, "fromEnvironment");
    if (fromEnvironmentArg && !isEnvironment(fromEnvironmentArg)) {
        log.error(`--fromEnvironment must be one of: ${ENVIRONMENTS.join(", ")}`);
        return process.exit(1);
    }

    const destEnvironment = environmentArg;
    const sourceEnvironment = (fromEnvironmentArg as typeof environmentArg | undefined) ?? destEnvironment;

    let sourceUrl: string, sourceDbName: string, destUrl: string, destDbName: string;
    try {
        ({ url: sourceUrl, name: sourceDbName } = resolveDatabase(sourceEnvironment));
        ({ url: destUrl, name: destDbName } = resolveDatabase(destEnvironment));
    } catch (err) {
        log.error((err as Error).message);
        process.exit(1);
    }

    log.section("The Citadel — MongoDB Migration");
    log.info(`Source: ${sourceEnvironment}`);
    log.info(`Dest:   ${destEnvironment}`);
    if (dryRun) log.warn("--dry-run: no data will be written");
    if (resolveUsersOnly) log.info("--resolve-users: only reviews migration will run");

    const sourceClient = new MongoClient(sourceUrl);
    const destClient = new MongoClient(destUrl);

    try {
        await sourceClient.connect();
        await destClient.connect();

        const sourceDb = sourceClient.db(sourceDbName);
        const destDb = destClient.db(destDbName);

        log.success(`Source: ${sourceUrl} / ${sourceDbName}`);
        log.success(`Dest:   ${destUrl} / ${destDbName}`);

        // Migration registry lives on the destination
        const applied = await getAppliedMigrations(destDb);
        log.info(`${applied.size} migration(s) previously applied to destination`);

        const ctx: MigrationContext = { sourceDb, destDb, dryRun, resolveUsersOnly };

        for (const migration of ALL_MIGRATIONS) {
            if (resolveUsersOnly && migration.name !== "003_reviews") continue;

            const alreadyApplied = applied.has(migration.name);
            if (alreadyApplied) {
                // Re-running is safe: migrated documents are replaced in place (matched on natural
                // keys) and dest-only documents are untouched — but we still skip by default.
                log.info(
                    `Skipping "${migration.name}" (already applied) — use --dry-run to preview or clear _migrations to re-run`
                );
                continue;
            }

            log.section(migration.name);
            log.info(migration.description);

            try {
                await migration.run(ctx);
                if (!dryRun) await markMigrationApplied(destDb, migration.name);
            } catch (err) {
                log.error(`Migration "${migration.name}" failed — aborting`, err);
                process.exit(1);
            }
        }

        if (hasUnresolvedMappings()) {
            log.section("Action Required");
            log.warn("unresolved-users.json contains unfilled entries.");
            log.info("Edit the file, add the Discord IDs, then run:");
            log.info("  npm run migrate -- --resolve-users");
        }

        log.section("Done");
        log.success(dryRun ? "Dry run complete — no data was written" : "All pending migrations complete");
    } finally {
        await sourceClient.close();
        await destClient.close();
        await destroyDiscordClient();
    }
}

main().catch((err) => {
    log.error("Unexpected error", err);
    process.exit(1);
});
