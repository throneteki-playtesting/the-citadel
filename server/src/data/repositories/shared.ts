import { IAuditable } from "common/models/shared";
import MongoDataSource from "./dataSources/mongoDataSource";
import { Filter, SingleOrArray, Sort } from "common/types";
import { asArray } from "common/utils";
import { flatten } from "flat";
import { Sort as MongoSort } from "mongodb";
import { getContext } from "@/middleware/context";
import { IRepository } from "@/types";
import { logger } from "@/services";
import { groupBy, isEqual } from "lodash-es";
import { ResourceDataMap, ResourceType } from "common/resources";
import { broadcastResourceChange } from "@/services/sseService";

// ── Non-broadcasting base ────────────────────────────────────────────────────

export class Database<T> {
    protected database: MongoDataSource<T>;

    constructor(database: MongoDataSource<T>) {
        this.database = database;
    }
}

const AUDIT_FIELDS = new Set(["_metadata", "updated", "updatedBy", "created", "createdBy"]);
const stripAudit = (obj: object) =>
    Object.fromEntries(Object.entries(obj).filter(([k]) => !AUDIT_FIELDS.has(k)));

async function doApplyAudit<T extends IAuditable>(
    database: MongoDataSource<T>,
    auditing: SingleOrArray<T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">>,
    isNew: boolean
): Promise<T[]> {
    const { principal } = getContext();
    const now = new Date();
    const items = asArray(auditing);

    if (isNew) {
        return items.map(data => ({
            ...data,
            updated: now,
            updatedBy: principal.id,
            created: now,
            createdBy: principal.id
        } as T));
    }

    const pks = database.primaryKeys;
    const filters = items.map(item =>
        pks.reduce((f, pk) => ({ ...f, [pk]: item[pk] }), {} as Filter<T>)
    );
    const existing = await database.read(filters);
    const byKey = new Map(
        existing.map(e => [pks.map(pk => String(e[pk])).join("|"), e])
    );

    return items.map(data => {
        const key = pks.map(pk => String(data[pk])).join("|");
        const current = byKey.get(key);
        if (current && isEqual(stripAudit(data as object), stripAudit(current as object))) {
            // Only _metadata (or nothing) changed — preserve existing audit timestamps
            return { ...data, updated: current.updated, updatedBy: current.updatedBy } as T;
        }
        return { ...data, updated: now, updatedBy: principal.id } as T;
    });
}

export abstract class IAuditableDatabase<T extends IAuditable> extends Database<T> {
    protected applyAudit(auditing: T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">, isNew: boolean): Promise<T>;
    protected applyAudit(auditing: (T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">)[], isNew: boolean): Promise<T[]>;
    protected async applyAudit(auditing: SingleOrArray<T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">>, isNew: boolean) {
        const result = await doApplyAudit(this.database, auditing, isNew);
        return Array.isArray(auditing) ? result : result[0];
    }
}

// ── Broadcast-capable base ───────────────────────────────────────────────────

export class BroadcastDatabase<K extends ResourceType, T extends ResourceDataMap[K] = ResourceDataMap[K]>
    extends Database<T> {
    protected readonly updateType: K;

    constructor(database: MongoDataSource<T>, updateType: K) {
        super(database);
        this.updateType = updateType;
    }

    protected broadcastCreates(items: T[]): void {
        if (items.length === 0) return;
        broadcastResourceChange(this.updateType, items, "create");
    }

    protected broadcastUpdates(items: T[]): void {
        if (items.length === 0) return;
        broadcastResourceChange(this.updateType, items, "update");
    }

    protected broadcastDeletes(items: T[]): void {
        if (items.length === 0) return;
        broadcastResourceChange(this.updateType, items, "delete");
    }
}

export abstract class BroadcastIAuditableDatabase<K extends ResourceType, T extends IAuditable & ResourceDataMap[K] = IAuditable & ResourceDataMap[K]>
    extends BroadcastDatabase<K, T> {
    protected applyAudit(auditing: T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">, isNew: boolean): Promise<T>;
    protected applyAudit(auditing: (T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">)[], isNew: boolean): Promise<T[]>;
    protected async applyAudit(auditing: SingleOrArray<T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">>, isNew: boolean) {
        const result = await doApplyAudit(this.database, auditing, isNew);
        return Array.isArray(auditing) ? result : result[0];
    }
}

// ── Repository base classes ──────────────────────────────────────────────────

export class BasicAuditableRepository<K extends ResourceType, T extends IAuditable & ResourceDataMap[K] = IAuditable & ResourceDataMap[K]>
    extends BroadcastIAuditableDatabase<K, T> implements IRepository<T> {
    public async create(creating: T, broadcast?: boolean): Promise<T>;
    public async create(creating: T[], broadcast?: boolean): Promise<T[]>;
    public async create(creating: SingleOrArray<T>, broadcast = true) {
        const audited = await this.applyAudit(asArray(creating), true);
        const result = await this.database.create(audited);
        if (broadcast) {
            this.broadcastCreates(result);
        }
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

    public async update(updating: T, upsert?: boolean, broadcast?: boolean): Promise<T>;
    public async update(updating: T[], upsert?: boolean, broadcast?: boolean): Promise<T[]>;
    public async update(updating: SingleOrArray<T>, upsert = true, broadcast = true) {
        const audited = await this.applyAudit(asArray(updating), false);
        const result = await this.database.update(audited, { upsert });
        if (broadcast) {
            this.broadcastUpdates(result);
        }
        return Array.isArray(updating) ? result : result[0];
    }

    public async destroy(destroying: SingleOrArray<Filter<T>>, broadcast = true): Promise<T[]> {
        const result = await this.database.destroy(destroying);
        if (broadcast) {
            this.broadcastDeletes(result);
        }
        return result;
    }

    protected async internalSync(tasks: SyncTask[]) {
        if (tasks.length === 0) return;
        const { source } = getContext();

        const syncs = tasks.map((task) => typeof task === "function" ? { priority: 9999, func: task as () => Promise<unknown> } : task);
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

export class BasicRepository<K extends ResourceType, T extends ResourceDataMap[K] = ResourceDataMap[K]>
    extends BroadcastDatabase<K, T> implements IRepository<T> {
    public async create(creating: T, broadcast?: boolean): Promise<T>;
    public async create(creating: T[], broadcast?: boolean): Promise<T[]>;
    public async create(creating: SingleOrArray<T>, broadcast = true) {
        const result = await this.database.create(creating);
        if (broadcast) {
            this.broadcastCreates(result);
        }
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

    public async update(updating: T, upsert?: boolean, broadcast?: boolean): Promise<T>;
    public async update(updating: T[], upsert?: boolean, broadcast?: boolean): Promise<T[]>;
    public async update(updating: SingleOrArray<T>, upsert = true, broadcast = true) {
        const items = asArray(updating);
        const result = await this.database.update(items, { upsert });
        if (broadcast) {
            this.broadcastUpdates(result);
        }
        return Array.isArray(updating) ? result : result[0];
    }

    public async destroy(destroying: SingleOrArray<Filter<T>>, broadcast = true): Promise<T[]> {
        const result = await this.database.destroy(destroying);
        if (broadcast) {
            this.broadcastDeletes(result);
        }
        return result;
    }
}
