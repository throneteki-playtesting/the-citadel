import MongoDataSource from "./dataSources/mongoDataSource";
import { Document, MongoClient } from "mongodb";
import { Role, User } from "common/models/auth";
import Permission from "common/models/permissions";
import { BasicRepository } from "./shared";
import { SingleOrArray } from "common/types";
import { logger } from "@/services";
import { broadcastResourceChange } from "@/services/sseService";
import { asArray } from "common/utils";
import { refreshReleaseChecks } from "@/discord/announcements/releaseChecks";

export default class UsersRepository extends BasicRepository<"user"> {
    private cachedGuestProfile: User | undefined;

    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<User>(mongoClient, "users", { discordId: 1 }), "user");
        this.initialiseGuestProfile();
    }

    private async initialiseGuestProfile() {
        const [existing] = await this.read({ discordId: "anonymous" });
        if (!existing) {
            // Sync off - this runs at construction, and the guest never counts as an eligible submitter
            await this.create(
                {
                    id: "anonymous",
                    discordId: "anonymous",
                    username: "Guest",
                    displayname: "Guest",
                    avatarUrl: "undefined",
                    permissions: [],
                    roles: []
                },
                false
            );
            logger.info("Created anonymous guest user profile");
        }
    }

    public override async create(creating: User, sync?: boolean, broadcast?: boolean): Promise<User>;
    public override async create(creating: User[], sync?: boolean, broadcast?: boolean): Promise<User[]>;
    public override async create(creating: SingleOrArray<User>, sync = true, broadcast = true) {
        let data = asArray(creating);
        data = await super.create(data, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(updating: User, upsert?: boolean, sync?: boolean, broadcast?: boolean): Promise<User>;
    public override async update(
        updating: User[],
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<User[]>;
    public override async update(updating: SingleOrArray<User>, upsert = true, sync = true, broadcast = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public async sync(syncing: User): Promise<User>;
    public async sync(syncing: User[]): Promise<User[]>;
    public async sync(syncing: SingleOrArray<User>) {
        const data = asArray(syncing);
        // Both a permission grant and a role gained or lost move who's counted in the announcement's turnout
        const syncs = [{ priority: 0, func: () => refreshReleaseChecks() }];

        await this.internalSync(syncs);

        return Array.isArray(syncing) ? data : data[0];
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
    private async permissionFilter(permission: Permission): Promise<Document> {
        const guestProfile = await this.getGuestProfile();
        const isDefault =
            !!guestProfile &&
            (guestProfile.permissions.includes(permission) ||
                guestProfile.roles.some((role) => role.permissions.includes(permission)));

        // The guest profile stands in for unauthenticated access, never a person who could answer
        const notGuest = { discordId: { $ne: "anonymous" } };
        return isDefault
            ? notGuest
            : { ...notGuest, $or: [{ permissions: permission }, { "roles.permissions": permission }] };
    }

    async countByPermission(permission: Permission): Promise<number> {
        return this.database.collection.countDocuments(await this.permissionFilter(permission));
    }

    // Identities rather than a count, for callers which must exclude anyone who has since lost the permission
    async findIdsByPermission(permission: Permission): Promise<Set<string>> {
        const results = await this.database.collection
            .find(await this.permissionFilter(permission), { projection: { discordId: 1 } })
            .toArray();

        return new Set(results.map((result) => result.discordId as string));
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
