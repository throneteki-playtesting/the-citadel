import { IAuditable } from "common/models/shared";
import MongoDataSource from "./dataSources/mongoDataSource";
import { Filter, SingleOrArray, Sort } from "common/types";
import { asArray } from "common/utils";
import { flatten } from "flat";
import { Document, Sort as MongoSort } from "mongodb";
import { getContext, requestContext } from "@/middleware/context";
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

    protected async internalSync(tasks: SyncTask[]) {
        if (tasks.length === 0) return;
        const context = getContext();

        const syncs = tasks.map((task) =>
            typeof task === "function" ? { priority: 9999, func: task as () => Promise<unknown> } : task
        );
        if (context.source === "client") {
            void requestContext.run({ ...context, detached: true }, () => runSyncsByPriority(syncs));
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

type SyncTask = (() => Promise<unknown>) | { priority: number; func: () => Promise<unknown> };

async function runSyncsByPriority(syncs: { priority: number; func: () => Promise<unknown> }[]) {
    const priorityGroups = groupBy(syncs, "priority");
    const sortedPriorities = Object.keys(priorityGroups)
        .map(Number)
        .sort((a, b) => a - b);

    for (const priority of sortedPriorities) {
        await Promise.all(priorityGroups[priority].map(({ func }) => func().catch((err) => logger.warn(err))));
    }
}

// Pipeline stages (typically $lookup/$addFields) for one virtual field, keyed by its top-level name
export type VirtualFieldMap = Record<string, Document[]>;

// Only pulls in a virtual field's stages when a request actually references it - zero cost otherwise
function virtualStagesFor<T>(
    virtualFields: VirtualFieldMap,
    reading?: SingleOrArray<Filter<T>>,
    orderBy?: Sort<T>
): Document[] {
    const keys = new Set<string>();
    asArray(reading ?? []).forEach((filter) => Object.keys(filter as object).forEach((key) => keys.add(key)));
    if (orderBy) {
        Object.keys(orderBy).forEach((key) => keys.add(key));
    }
    return Object.entries(virtualFields)
        .filter(([field]) => keys.has(field))
        .flatMap(([, stages]) => stages);
}

// Shared by both repository base classes' read/count, same pattern as doApplyAudit below
async function doRead<T, TFilterable extends T>(
    database: MongoDataSource<T>,
    virtualFields: VirtualFieldMap,
    reading?: SingleOrArray<Filter<TFilterable>>,
    orderBy?: Sort<TFilterable>,
    page?: number,
    perPage?: number
): Promise<TFilterable[]> {
    const sort = orderBy ? (flatten(orderBy) as MongoSort) : undefined;
    const limit = perPage;
    const skip = (page - 1) * perPage;
    const stages = virtualStagesFor(virtualFields, reading, orderBy);
    if (stages.length === 0) {
        return (await database.read(reading, { sort, limit, skip })) as TFilterable[];
    }
    return await database.aggregateRead<TFilterable>(stages, reading, { sort, limit, skip });
}

async function doCount<T, TFilterable extends T>(
    database: MongoDataSource<T>,
    virtualFields: VirtualFieldMap,
    counting?: SingleOrArray<Filter<TFilterable>>
): Promise<number> {
    const stages = virtualStagesFor(virtualFields, counting);
    return stages.length === 0 ? database.count(counting) : database.aggregateCount<TFilterable>(stages, counting);
}

const AUDIT_FIELDS = new Set(["_metadata", "updated", "updatedBy", "created", "createdBy"]);
const stripAudit = (obj: object) => Object.fromEntries(Object.entries(obj).filter(([k]) => !AUDIT_FIELDS.has(k)));

async function doApplyAudit<T extends IAuditable>(
    database: MongoDataSource<T>,
    auditing: SingleOrArray<T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">>,
    isNew: boolean
): Promise<T[]> {
    const { principal } = getContext();
    const now = new Date();
    const items = asArray(auditing);

    if (isNew) {
        return items.map(
            (data) =>
                ({
                    ...data,
                    updated: now,
                    updatedBy: principal.id,
                    created: now,
                    createdBy: principal.id
                }) as T
        );
    }

    const pks = database.primaryKeys;
    const filters = items.map((item) => pks.reduce((f, pk) => ({ ...f, [pk]: item[pk] }), {} as Filter<T>));
    const existing = await database.read(filters);
    const byKey = new Map(existing.map((e) => [pks.map((pk) => String(e[pk])).join("|"), e]));

    return items.map((data) => {
        const key = pks.map((pk) => String(data[pk])).join("|");
        const current = byKey.get(key);
        // Creation is only ever recorded once - an update can't rewrite who or when, whatever its body says
        const creation = current
            ? { created: current.created, createdBy: current.createdBy }
            : { created: now, createdBy: principal.id };
        if (current && isEqual(stripAudit(data as object), stripAudit(current as object))) {
            // Only _metadata (or nothing) changed — preserve existing audit timestamps
            return { ...data, ...creation, updated: current.updated, updatedBy: current.updatedBy } as T;
        }
        return { ...data, ...creation, updated: now, updatedBy: principal.id } as T;
    });
}

export abstract class IAuditableDatabase<T extends IAuditable> extends Database<T> {
    protected applyAudit(
        auditing: T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">,
        isNew: boolean
    ): Promise<T>;
    protected applyAudit(
        auditing: (T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">)[],
        isNew: boolean
    ): Promise<T[]>;
    protected async applyAudit(
        auditing: SingleOrArray<T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">>,
        isNew: boolean
    ) {
        const result = await doApplyAudit(this.database, auditing, isNew);
        return Array.isArray(auditing) ? result : result[0];
    }
}

// ── Broadcast-capable base ───────────────────────────────────────────────────

export class BroadcastDatabase<
    K extends ResourceType,
    T extends ResourceDataMap[K] = ResourceDataMap[K]
> extends Database<T> {
    protected readonly updateType: K;

    constructor(database: MongoDataSource<T>, updateType: K) {
        super(database);
        this.updateType = updateType;
    }

    protected broadcastCreates(items: T[]): void {
        if (items.length === 0) return;
        broadcastResourceChange(this.updateType, items, "create");
    }

    protected broadcastUpdates(items: T[], options?: { silent?: boolean }): void {
        if (items.length === 0) return;
        broadcastResourceChange(this.updateType, items, "update", options);
    }

    protected broadcastDeletes(items: T[]): void {
        if (items.length === 0) return;
        broadcastResourceChange(this.updateType, items, "delete");
    }
}

export abstract class BroadcastIAuditableDatabase<
    K extends ResourceType,
    T extends IAuditable & ResourceDataMap[K] = IAuditable & ResourceDataMap[K]
> extends BroadcastDatabase<K, T> {
    protected applyAudit(
        auditing: T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">,
        isNew: boolean
    ): Promise<T>;
    protected applyAudit(
        auditing: (T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">)[],
        isNew: boolean
    ): Promise<T[]>;
    protected async applyAudit(
        auditing: SingleOrArray<T | Omit<T, "updated" | "updatedBy" | "created" | "createdBy">>,
        isNew: boolean
    ) {
        const result = await doApplyAudit(this.database, auditing, isNew);
        return Array.isArray(auditing) ? result : result[0];
    }
}

// ── Repository base classes ──────────────────────────────────────────────────

export class BasicAuditableRepository<
        K extends ResourceType,
        T extends IAuditable & ResourceDataMap[K] = IAuditable & ResourceDataMap[K],
        // Widen to T plus a repository's virtual fields (eg. IPlaytestCardFilterable) so read/count accept them
        TFilterable extends T = T
    >
    extends BroadcastIAuditableDatabase<K, T>
    implements IRepository<T>
{
    // Override to add aggregation-computed fields read/count can filter/sort by - see cardsRepository's `reviews`
    protected virtualFields: VirtualFieldMap = {};

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

    public async read(
        reading?: SingleOrArray<Filter<TFilterable>>,
        orderBy?: Sort<TFilterable>,
        page?: number,
        perPage?: number
    ): Promise<TFilterable[]> {
        return doRead(this.database, this.virtualFields, reading, orderBy, page, perPage);
    }

    public async count(counting?: SingleOrArray<Filter<TFilterable>>): Promise<number> {
        return doCount(this.database, this.virtualFields, counting);
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
}

export class BasicRepository<
    K extends ResourceType,
    T extends ResourceDataMap[K] = ResourceDataMap[K],
    TFilterable extends T = T
> extends BroadcastDatabase<K, T> implements IRepository<T> {
    protected virtualFields: VirtualFieldMap = {};

    public async create(creating: T, broadcast?: boolean): Promise<T>;
    public async create(creating: T[], broadcast?: boolean): Promise<T[]>;
    public async create(creating: SingleOrArray<T>, broadcast = true) {
        const result = await this.database.create(creating);
        if (broadcast) {
            this.broadcastCreates(result);
        }
        return Array.isArray(creating) ? result : result[0];
    }

    public async read(
        reading?: SingleOrArray<Filter<TFilterable>>,
        orderBy?: Sort<TFilterable>,
        page?: number,
        perPage?: number
    ): Promise<TFilterable[]> {
        return doRead(this.database, this.virtualFields, reading, orderBy, page, perPage);
    }

    public async count(counting?: SingleOrArray<Filter<TFilterable>>): Promise<number> {
        return doCount(this.database, this.virtualFields, counting);
    }

    public async update(updating: T, upsert?: boolean, broadcast?: boolean, silent?: boolean): Promise<T>;
    public async update(updating: T[], upsert?: boolean, broadcast?: boolean, silent?: boolean): Promise<T[]>;
    public async update(updating: SingleOrArray<T>, upsert = true, broadcast = true, silent = false) {
        const items = asArray(updating);
        const result = await this.database.update(items, { upsert });
        if (broadcast) {
            this.broadcastUpdates(result, { silent });
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
