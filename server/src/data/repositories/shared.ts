import { IAuditable } from "common/models/shared";
import MongoDataSource from "./dataSources/mongoDataSource";
import { Filter, SingleOrArray, Sort } from "common/types";
import { asArray } from "common/utils";
import { flatten } from "flat";
import { Sort as MongoSort } from "mongodb";
import { getContext } from "@/middleware/context";
import { IRepository } from "@/types";
import { logger } from "@/services";
import { groupBy } from "lodash-es";


export class Database<T> {
    protected database: MongoDataSource<T>;
    constructor(database: MongoDataSource<T>) {
        this.database = database;
    }
}
export abstract class IAuditableDatabase<T extends IAuditable> extends Database<T> {
    protected async applyAudit(auditing: T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">, isNew: boolean): Promise<T>;
    protected async applyAudit(auditing: T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">[], isNew: boolean): Promise<T[]>;
    protected async applyAudit(auditing: SingleOrArray<T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">>, isNew: boolean) {
        const { principal } = getContext();
        const now = new Date();
        const audited = asArray(auditing).map((data) => ({
            ...data,
            updated: now,
            updatedBy: principal.id,
            ...(isNew && { created: now, createdBy: principal.id })
        } as T));

        return Array.isArray(auditing) ? audited : audited[0];
    }
}

export class BasicAuditableRepository<T extends IAuditable> extends IAuditableDatabase<T> implements IRepository<T> {
    public async create(creating: T): Promise<T>;
    public async create(creating: T[]): Promise<T[]>;
    public async create(creating: SingleOrArray<T>) {
        const audited = await this.applyAudit(asArray(creating), true);
        const result = await this.database.create(audited);
        return Array.isArray(creating) ? result : result[0];
    }

    public async read(reading?: SingleOrArray<Filter<T>>, orderBy?: Sort<T>, page?: number, perPage?: number) {
        const sort = orderBy ? flatten(orderBy) as MongoSort : undefined;
        const limit = perPage;
        const skip = (page - 1) * perPage;
        return await this.database.read(reading, { sort, limit, skip });
    }

    public async count(counting?: SingleOrArray<Filter<T>>) {
        return this.database.count(counting);
    }

    public async update(updating: T, upsert?: boolean): Promise<T>;
    public async update(updating: T[], upsert?: boolean): Promise<T[]>;
    public async update(updating: SingleOrArray<T>, upsert = true) {
        const audited = await this.applyAudit(asArray(updating), false);
        const result = await this.database.update(audited, { upsert });
        return Array.isArray(updating) ? result : result[0];
    }

    public async destroy(destroying: SingleOrArray<Filter<T>>): Promise<T[]> {
        return await this.database.destroy(destroying);
    }

    protected async internalSync(tasks: SyncTask[]) {
        if (tasks.length === 0) {
            return;
        }
        const { source } = getContext();

        const syncs = tasks.map((task) => typeof task === "function" ? { priority: 9999, func: task as () => Promise<unknown> } : task);
        // Client does not need to wait for syncing to complete
        if (source === "client") {
            const priorityGroups = groupBy(syncs, "priority");
            const sortedPriorities = Object.keys(priorityGroups).map(Number).sort((a, b) => a - b);
            void sortedPriorities.reduce(
                (chain, priority) => chain.then(() =>
                    Promise.all(priorityGroups[priority].map(({ func }) => func().catch(err => logger.warn(err))))
                ),
                Promise.resolve() as Promise<unknown>
            );
        } else {
            for (const { func } of syncs.sort((a, b) => a.priority - b.priority)) {
                try {
                    await func();
                } catch (err) {
                    logger.warn(err);
                }
            }
        }
    }
}
type SyncTask = (() => Promise<unknown>) | { priority: number, func: () => Promise<unknown> };

export class BasicRepository<T> extends Database<T> implements IRepository<T> {
    public async create(creating: T): Promise<T>;
    public async create(creating: T[]): Promise<T[]>;
    public async create(creating: SingleOrArray<T>) {
        const result = await this.database.create(creating);
        return Array.isArray(creating) ? result : result[0];
    }

    public async read(reading?: SingleOrArray<Filter<T>>, orderBy?: Sort<T>, page?: number, perPage?: number) {
        const sort = orderBy ? flatten(orderBy) as MongoSort : undefined;
        const limit = perPage;
        const skip = (page - 1) * perPage;
        return await this.database.read(reading, { sort, limit, skip });
    }

    public async count(counting?: SingleOrArray<Filter<T>>) {
        return this.database.count(counting);
    }

    public async update(updating: T, upsert?: boolean): Promise<T>;
    public async update(updating: T[], upsert?: boolean): Promise<T[]>;
    public async update(updating: SingleOrArray<T>, upsert = true) {
        const result = await this.database.update(updating, { upsert });
        return Array.isArray(updating) ? result : result[0];
    }

    public async destroy(destroying: SingleOrArray<Filter<T>>): Promise<T[]> {
        return await this.database.destroy(destroying);
    }
}