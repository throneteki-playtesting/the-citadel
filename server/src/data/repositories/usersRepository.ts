import MongoDataSource from "./dataSources/mongoDataSource";
import { Document, MongoClient } from "mongodb";
import { Role, User } from "common/models/auth";
import { BasicRepository } from "./shared";
import { SingleOrArray } from "common/types";
import { logger } from "@/services";

export default class UsersRepository extends BasicRepository<User> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<User>(mongoClient, "users", { discordId: 1 }));
        this.initialiseGuestProfile();
    }

    private async initialiseGuestProfile() {
        const [existing] = await this.read({ discordId: "anonymous" });
        if (!existing) {
            await this.create({
                id: "anonymous",
                discordId: "anonymous",
                username: "Guest",
                displayname: "Guest",
                avatarUrl: "undefined",
                permissions: [],
                roles: []
            });
            logger.info("Created anonymous guest user profile");
        }
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