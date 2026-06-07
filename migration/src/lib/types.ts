import { Db } from "mongodb";

export type MigrationContext = {
    sourceDb: Db;
    destDb: Db;
    dryRun: boolean;
    resolveUsersOnly: boolean;
};

export type Migration = {
    name: string;
    description: string;
    run: (ctx: MigrationContext) => Promise<void>;
};
