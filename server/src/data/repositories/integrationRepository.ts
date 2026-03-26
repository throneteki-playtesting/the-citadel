import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { Integration, Role } from "common/models/auth";
import bcrypt from "bcryptjs";
import { IAuditableDatabase } from "./shared";
import Permission from "common/models/permissions";
import { randomBytes } from "crypto";
import { dataService } from "@/services";

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
        const rawToken = await dataService.redis.get(this.internalKey);
        return rawToken;
    }

    private generateKeys() {
        const id = this.prefix + randomBytes(8).toString("hex");
        const secret = randomBytes(32).toString("hex");
        const rawToken = `${id}.${secret}`;
        const tokenHash = bcrypt.hashSync(secret, 10);

        return { id, rawToken, tokenHash };
    }

    async generate(data: { name: string, enabled?: boolean, permissions?: Permission[], roles?: Role[] }) {
        const { id, rawToken, tokenHash } = this.generateKeys();
        let integration = await this.applyAudit({
            id,
            tokenHash,
            name: data.name,
            enabled: data.enabled ?? true,
            permissions: data.permissions ?? [],
            roles: data.roles ?? []
        }, true);

        [integration] = await this.database.create(integration);

        return { rawToken, integration };
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