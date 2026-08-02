import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { Role } from "common/models/auth";
import { BasicRepository } from "./shared";
import { SingleOrArray } from "common/types";
import { asArray } from "common/utils";
import { dataService } from "@/services";
import { refreshReleaseChecks } from "@/discord/announcements/releaseChecks";

export default class RolesRepository extends BasicRepository<"role"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<Role>(mongoClient, "roles", { discordId: 1 }), "role");
    }

    public override async update(updating: Role, upsert?: boolean, sync?: boolean): Promise<Role>;
    public override async update(updating: Role[], upsert?: boolean, sync?: boolean): Promise<Role[]>;
    public override async update(updating: SingleOrArray<Role>, upsert?: boolean, sync = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert);

        await dataService.users.syncEmbeddedRole(data);
        if (sync) {
            data = await this.sync(data);
        }

        return Array.isArray(updating) ? data : data[0];
    }

    public async sync(syncing: Role): Promise<Role>;
    public async sync(syncing: Role[]): Promise<Role[]>;
    public async sync(syncing: SingleOrArray<Role>) {
        const data = asArray(syncing);
        // A role's permission list is part of who can submit a check, so editing one dates the announcement
        const syncs = [{ priority: 0, func: () => refreshReleaseChecks() }];

        await this.internalSync(syncs);

        return Array.isArray(syncing) ? data : data[0];
    }
}
