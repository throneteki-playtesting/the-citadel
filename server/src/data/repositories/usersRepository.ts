import MongoDataSource from "./dataSources/mongoDataSource";
import { Document, MongoClient } from "mongodb";
import { Role, User } from "common/models/auth";
import Permission from "common/models/permissions";
import { BasicRepository } from "./shared";
import { SingleOrArray } from "common/types";
import { logger } from "@/services";
import { broadcastResourceChange } from "@/services/sseService";
import { asArray } from "common/utils";

export default class UsersRepository extends BasicRepository<"user"> {
    private cachedGuestProfile: User | undefined;

    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<User>(mongoClient, "users", { discordId: 1 }), "user");
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

    async getGuestProfile(): Promise<User | undefined> {
        if (!this.cachedGuestProfile) {
            [this.cachedGuestProfile] = await this.read({ discordId: "anonymous" });
        }
        return this.cachedGuestProfile;
    }

    invalidateGuestProfileCache() {
        this.cachedGuestProfile = undefined;
    }

    async countByRole(discordIds: string[]): Promise<Map<string, number>> {
        if (discordIds.length === 0) {
            return new Map();
        }

        const results = await this.database.collection
            .aggregate<{
                _id: string;
                count: number;
            }>([
                { $match: { "roles.discordId": { $in: discordIds } } },
                { $unwind: "$roles" },
                { $match: { "roles.discordId": { $in: discordIds } } },
                { $group: { _id: "$roles.discordId", count: { $sum: 1 } } }
            ])
            .toArray();

        return new Map(results.map((result) => [result._id, result.count]));
    }

    // Mirrors hasPermission's resolution: granted directly, via a role, or to everyone by the guest profile
    async countByPermission(permission: Permission): Promise<number> {
        const guestProfile = await this.getGuestProfile();
        const isDefault =
            !!guestProfile &&
            (guestProfile.permissions.includes(permission) ||
                guestProfile.roles.some((role) => role.permissions.includes(permission)));

        // The guest profile stands in for unauthenticated access, never a person who could answer
        const notGuest = { discordId: { $ne: "anonymous" } };
        const filter = isDefault
            ? notGuest
            : { ...notGuest, $or: [{ permissions: permission }, { "roles.permissions": permission }] };

        return this.database.collection.countDocuments(filter as Document);
    }

    async syncEmbeddedRole(roles: SingleOrArray<Role>) {
        const roleArray = asArray(roles);
        await this.database.collection.bulkWrite(
            roleArray.map((role) => ({
                updateMany: {
                    filter: { "roles.discordId": role.discordId } as Document,
                    update: { $set: { "roles.$[elem]": role } } as Document,
                    arrayFilters: [{ "elem.discordId": role.discordId }]
                }
            }))
        );
        for (const role of roleArray) {
            const affected = await this.read({ "roles.discordId": role.discordId } as never);
            if (affected.length > 0) {
                broadcastResourceChange("user", affected);
            }
        }
    }
}
