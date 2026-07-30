import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { Role } from "common/models/auth";
import { BasicRepository } from "./shared";
import { SingleOrArray } from "common/types";
import { asArray } from "common/utils";
import { dataService } from "@/services";

export default class RolesRepository extends BasicRepository<"role"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<Role>(mongoClient, "roles", { discordId: 1 }), "role");
    }

    public override async update(updating: Role, upsert?: boolean): Promise<Role>;
    public override async update(updating: Role[], upsert?: boolean): Promise<Role[]>;
    public override async update(updating: SingleOrArray<Role>, upsert?: boolean) {
        let data = asArray(updating);
        data = await super.update(data, upsert);

        await dataService.users.syncEmbeddedRole(data);

        return Array.isArray(updating) ? data : data[0];
    }
}
