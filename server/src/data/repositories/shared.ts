import { IAuditable } from "common/models/shared";
import MongoDataSource from "./dataSources/mongoDataSource";
import { IRepository } from "@/types";
import { getCurrentUser } from "@/middleware/context";
import { DeepPartial, SingleOrArray, Sortable } from "common/types";
import { asArray } from "common/utils";
import { flatten } from "flat";
import { Sort } from "mongodb";

export abstract class AuditableRepository<T extends IAuditable> implements IRepository<T> {
    protected abstract database: MongoDataSource<T>;

    protected async applyAudit(auditing: T, isNew: boolean): Promise<T>;
    protected async applyAudit(auditing: T[], isNew: boolean): Promise<T[]>;
    protected async applyAudit(auditing: SingleOrArray<T>, isNew: boolean) {
        const user = getCurrentUser();
        const now = new Date();
        const audited = asArray(auditing).map((data) => ({
            ...data,
            updated: now,
            updatedBy: user.discordId,
            ...(isNew && { created: now, createdBy: user.discordId })
        }));

        return Array.isArray(auditing) ? audited : audited[0];
    }

    public async create(creating: T): Promise<T>;
    public async create(creating: T[]): Promise<T[]>;
    public async create(creating: SingleOrArray<T>) {
        const audited = await this.applyAudit(asArray(creating), true);
        const result = await this.database.create(audited);
        return Array.isArray(creating) ? result : result[0];
    }

    public async read(reading?: SingleOrArray<DeepPartial<T>>, orderBy?: Sortable<T>, page?: number, perPage?: number) {
        const sort = orderBy ? flatten(orderBy) as Sort : undefined;
        const limit = perPage;
        const skip = (page - 1) * perPage;
        return await this.database.read(reading, { sort, limit, skip });
    }

    public async count(counting?: SingleOrArray<DeepPartial<T>>) {
        return this.database.count(counting);
    }

    public async update(updating: T, upsert?: boolean): Promise<T>;
    public async update(updating: T[], upsert?: boolean): Promise<T[]>;
    public async update(updating: SingleOrArray<T>, upsert = true) {
        const audited = await this.applyAudit(asArray(updating), false);
        const result = await this.database.update(audited, { upsert });
        return Array.isArray(updating) ? result : result[0];
    }

    public abstract destroy(destroying: SingleOrArray<DeepPartial<T>>): Promise<T[]>;
}