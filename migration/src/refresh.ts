import "dotenv/config";
import { MongoClient } from "mongodb";
import { log } from "./lib/logger";
import { getArgValue } from "./lib/args";
import { Environment, resolveDatabase } from "./lib/environments";
import { stripDiscordMetadata } from "./lib/stripDiscordMetadata";

// Everything else (users, roles, refreshTokens, integrations, logs) is auth/session/registry state
// that belongs to the environment it lives in, not to production's game data
const CITADEL_COLLECTIONS = ["cards", "projects", "slots", "reviews", "suggestions", "decks", "playtestingUpdates", "artists"];

const REFRESHABLE_ENVIRONMENTS: Environment[] = ["development", "staging"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

async function main() {
    const environmentArg = getArgValue(args, "environment");
    if (!environmentArg || !(REFRESHABLE_ENVIRONMENTS as string[]).includes(environmentArg)) {
        log.error(`--environment is required and must be one of: ${REFRESHABLE_ENVIRONMENTS.join(", ")}`);
        return process.exit(1);
    }
    if (getArgValue(args, "fromEnvironment")) {
        log.error("--fromEnvironment is not supported here — refresh always sources from production");
        return process.exit(1);
    }

    const destEnvironment = environmentArg as Environment;

    let sourceUrl: string, sourceDbName: string, destUrl: string, destDbName: string;
    try {
        ({ url: sourceUrl, name: sourceDbName } = resolveDatabase("production"));
        ({ url: destUrl, name: destDbName } = resolveDatabase(destEnvironment));
    } catch (err) {
        log.error((err as Error).message);
        return process.exit(1);
    }

    if (sourceUrl === destUrl && sourceDbName === destDbName) {
        log.error("Destination resolves to the same database as production — aborting");
        return process.exit(1);
    }

    log.section("The Citadel — Refresh from Production");
    log.info(`Source: production (${sourceDbName})`);
    log.info(`Dest:   ${destEnvironment} (${destDbName})`);
    if (dryRun) log.warn("--dry-run: no data will be written");

    const sourceClient = new MongoClient(sourceUrl);
    const destClient = new MongoClient(destUrl);

    try {
        await sourceClient.connect();
        await destClient.connect();

        const sourceDb = sourceClient.db(sourceDbName);
        const destDb = destClient.db(destDbName);

        for (const collectionName of CITADEL_COLLECTIONS) {
            const docs = await sourceDb.collection(collectionName).find({}).toArray();
            docs.forEach(stripDiscordMetadata);

            log.info(`${collectionName}: ${docs.length} document(s) from production`);

            if (dryRun) {
                continue;
            }

            await destDb.collection(collectionName).deleteMany({});
            if (docs.length > 0) {
                await destDb.collection(collectionName).insertMany(docs, { ordered: false });
            }
            log.success(`${collectionName}: replaced in ${destEnvironment}`);
        }

        log.section("Done");
        log.success(dryRun ? "Dry run complete — no data was written" : `${destEnvironment} refreshed from production`);
    } finally {
        await sourceClient.close();
        await destClient.close();
    }
}

main().catch((err) => {
    log.error("Unexpected error", err);
    process.exit(1);
});
