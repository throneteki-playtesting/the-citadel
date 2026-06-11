import MongoDataSource from "./dataSources/mongoDataSource";
import { Document, MongoClient } from "mongodb";
import { Role, User } from "common/models/auth";
import { BasicRepository } from "./shared";
import { SingleOrArray } from "common/types";

export default class UsersRepository extends BasicRepository<User> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<User>(mongoClient, "users", { discordId: 1 }));
    }

    async syncEmbeddedRole(roles: SingleOrArray<Role>) {
        const roleArray = Array.isArray(roles) ? roles : [roles];
        await this.database.collection.bulkWrite(
            roleArray.map((role) => ({
                updateMany: {
                    filter: { "roles.discordId": role.discordId } as Document,
                    update: { $set: { "roles.$[elem]": role } } as Document,
                    arrayFilters: [{ "elem.discordId": role.discordId }]
                }
            }))
        );
    }
}