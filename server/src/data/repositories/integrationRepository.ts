import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient, Sort as MongoSort } from "mongodb";
import { Integration } from "common/models/auth";
import bcrypt from "bcryptjs";
import { IAuditableDatabase } from "./shared";
import Permission from "common/models/permissions";
import { randomBytes } from "crypto";
import { dataService } from "@/services";
import { Filter, SingleOrArray, Sort } from "common/types";
import { asArray } from "common/utils";
import { flatten } from "flat";

export default class IntegrationRepository extends IAuditableDatabase<Integration> {
    private prefix = "int_";
    private internalKey = "INTERNAL_INTEGRATION_TOKEN";
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<Integration>(mongoClient, "integrations", { id: 1 }));
        this.initialise();
    }

    /**
     * Initialises an internal intergration which is used by certain processes, such as rendering.
     * Should only be accessible by the internal application (ie. via redis), has all permissions, and created itself.
     */
    private async initialise() {
        const name = "Internal Integration";
        let integration = await this.database.readOne({ name });
        if (integration) {
            await this.database.destroy(integration);
        }
        const { id, rawToken, tokenHash } = this.generateKeys();
        const now = new Date();
        const data = {
            id,
            tokenHash,
            name,
            enabled: true,
            internal: true,
            permissions: Object.values(Permission),
            roles: [],
            created: now,
            updated: now,
            createdBy: id,
            updatedBy: id
        };
        [integration] = await this.database.create(data);

        await dataService.redis.set(this.internalKey, rawToken);
    }

    async fetchInternalToken() {
        const rawToken = await dataService.redis.get(this.internalKey) as string;
        return rawToken;
    }

    private generateSecret() {
        const secret = randomBytes(32).toString("hex");
        const tokenHash = bcrypt.hashSync(secret, 10);

        return { secret, tokenHash };
    }

    private generateKeys() {
        const id = this.prefix + randomBytes(8).toString("hex");
        const { secret, tokenHash } = this.generateSecret();
        const rawToken = `${id}.${secret}`;

        return { id, rawToken, tokenHash };
    }

    private excludeInternal(filter?: SingleOrArray<Filter<Integration>>) {
        const filters = filter !== undefined ? asArray(filter) : [{}];
        return filters.map((f) => ({ ...f, internal: { $ne: true } } as Filter<Integration>));
    }

    async generate(data: { name: string, enabled?: boolean, permissions?: Permission[], ownerIds?: string[] }) {
        const { id, rawToken, tokenHash } = this.generateKeys();
        let integration = await this.applyAudit({
            id,
            tokenHash,
            name: data.name,
            enabled: data.enabled ?? true,
            permissions: data.permissions ?? [],
            roles: [],
            ownerIds: data.ownerIds ?? []
        }, true);

        [integration] = await this.database.create(integration);

        return { rawToken, integration };
    }

    async recycleToken(integration: Integration) {
        const { secret, tokenHash } = this.generateSecret();
        const audited = await this.applyAudit({ ...integration, tokenHash }, false);
        const [updated] = await this.database.update(audited);

        return { rawToken: `${integration.id}.${secret}`, integration: updated };
    }

    public async read(reading?: SingleOrArray<Filter<Integration>>, orderBy?: Sort<Integration>, page?: number, perPage?: number) {
        const sort = orderBy ? flatten(orderBy) as MongoSort : undefined;
        const limit = perPage;
        const skip = (page - 1) * perPage;
        return await this.database.read(this.excludeInternal(reading), { sort, limit, skip });
    }

    public async readOne(id: string) {
        return await this.database.readOne({ id, internal: { $ne: true } } as Filter<Integration>);
    }

    public async count(counting?: SingleOrArray<Filter<Integration>>) {
        return this.database.count(this.excludeInternal(counting));
    }

    public async update(updating: Integration) {
        const audited = await this.applyAudit(updating, false);
        const [updated] = await this.database.update(audited);
        return updated;
    }

    public async destroy(id: string) {
        return await this.database.destroy({ id, internal: { $ne: true } } as Filter<Integration>);
    }

    async findByToken(rawToken: string): Promise<Integration | undefined> {
        if (!rawToken.startsWith(this.prefix)) return undefined;

        const dotIndex = rawToken.indexOf(".");
        if (dotIndex === -1) return undefined;

        const id = rawToken.substring(0, dotIndex);
        const secret = rawToken.substring(dotIndex + 1);

        let integration = await this.database.readOne({ id, enabled: true });
        if (!integration) return undefined;

        const valid = await bcrypt.compare(secret, integration.tokenHash);

        if (valid) {
            integration.lastUsedAt = new Date();
            [integration] = await this.database.update(integration);
            return integration;
        }
        return undefined;
    }
}