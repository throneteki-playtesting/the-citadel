import { Db } from "mongodb";
import { log } from "./logger";

const COLLECTION = "_migrations";

type MigrationRecord = {
    name: string;
    appliedAt: Date;
};

export async function getAppliedMigrations(db: Db): Promise<Set<string>> {
    const col = db.collection<MigrationRecord>(COLLECTION);
    const records = await col.find({}).toArray();
    return new Set(records.map((r) => r.name));
}

export async function markMigrationApplied(db: Db, name: string): Promise<void> {
    const col = db.collection<MigrationRecord>(COLLECTION);
    await col.insertOne({ name, appliedAt: new Date() });
    log.verbose(`Marked migration "${name}" as applied`);
}

export async function unmarkMigration(db: Db, name: string): Promise<void> {
    const col = db.collection<MigrationRecord>(COLLECTION);
    await col.deleteOne({ name });
    log.verbose(`Removed migration record for "${name}"`);
}
