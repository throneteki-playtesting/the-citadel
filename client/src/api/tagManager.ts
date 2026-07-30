import { asArray } from "common/utils";
import { ResourceDataMap, ResourceType, resourceIdFuncs } from "common/resources";
import { User } from "common/models/auth";
import { SingleOrArray } from "common/types";
import api from "./index";
import { store } from "./store";

type TagEntity = ResourceDataMap & {
    me: User;
    tag: string;
};
export type ApiTag = keyof TagEntity;
export const tagTypes = [
    ...(Object.keys(resourceIdFuncs) as (keyof ResourceDataMap)[]),
    "me",
    "tag"
] as const satisfies readonly ApiTag[];

const defaultIdFuncs: { [K in ApiTag]: (result: TagEntity[K]) => string | number | undefined } = {
    ...resourceIdFuncs,
    project: (project) => project.number,
    me: (me) => me.discordId,
    tag: (tag) => tag
};

export type PendingTag = { type: ApiTag; id: string | number | undefined };

// Resource types whose id encodes a hierarchy can have their "list" queries scoped to it; field order must match the id's prefix order.
const listScopeFields: Partial<Record<ApiTag, string[]>> = {
    card: ["project", "number"],
    slot: ["project"]
};

// Stops at the first non-exact field (eg. a { $ne: ... } operator), since only exact equality folds into a scope key.
function scopeKeyFromFilter(fields: string[], filter: Record<string, unknown>): string | undefined {
    const values: string[] = [];
    for (const field of fields) {
        const value = filter[field];
        if (value === undefined || (typeof value === "object" && !(value instanceof Date))) {
            break;
        }
        values.push(String(value));
    }
    return values.length > 0 ? values.join("|") : undefined;
}

// Falls back to flat "LIST" if there's no scope config, no filter, or any filter entry isn't an exact scope.
function listScopeTagsFromArgs(
    tag: ApiTag,
    args: { filter?: SingleOrArray<Record<string, unknown>> } | undefined
): PendingTag[] {
    const fields = listScopeFields[tag];
    const filters = args?.filter !== undefined ? asArray(args.filter) : undefined;
    if (!fields || !filters) {
        return [{ type: tag, id: "LIST" }];
    }

    const keys = filters.map((filter) => scopeKeyFromFilter(fields, filter));
    if (keys.some((key) => key === undefined)) {
        return [{ type: tag, id: "LIST" }];
    }

    return [...new Set(keys)].map((key) => ({ type: tag, id: `LIST|${key}` }));
}

// Splits a composite id ("27|1|1.0.1") into every ancestor LIST-scope tag: LIST, LIST|27, LIST|27|1.
function listScopeTagsFromId(tag: ApiTag, id: string): PendingTag[] {
    const ancestors = id.split("|").slice(0, -1);
    return [
        { type: tag, id: "LIST" },
        ...ancestors.map((_part, i) => ({ type: tag, id: `LIST|${ancestors.slice(0, i + 1).join("|")}` }))
    ];
}

// providesTags (args given) uses the narrowest matching scope; invalidatesTags (results given) uses the full ancestor chain.
function listTagsFor<T>(
    tag: ApiTag,
    results: T | T[] | undefined,
    resolve: (result: T) => string | number | undefined,
    args: { filter?: SingleOrArray<Record<string, unknown>> } | undefined
): PendingTag[] {
    if (args !== undefined) {
        return listScopeTagsFromArgs(tag, args);
    }

    const tags = new Map<string, PendingTag>();
    if (results) {
        asArray(results).forEach((result) => {
            const id = resolve(result);
            if (id === undefined) {
                return;
            }
            listScopeTagsFromId(tag, String(id)).forEach((scopeTag) => tags.set(String(scopeTag.id), scopeTag));
        });
    }

    return tags.size > 0 ? Array.from(tags.values()) : [{ type: tag, id: "LIST" }];
}

// Builds RTK Query providesTags/invalidatesTags entries for a result set.
export function generateFor<T>(
    results: T | T[] | undefined,
    tag: ApiTag,
    options?: {
        idFunc?: (result: T) => string | number | undefined;
        includeList?: boolean;
        args?: unknown;
    }
): PendingTag[] {
    const resolve = (options?.idFunc ?? defaultIdFuncs[tag]) as (result: T) => string | number | undefined;

    const resultTags = results ? asArray(results).map((result) => ({ type: tag, id: resolve(result) })) : [];

    const listTags =
        (options?.includeList ?? true)
            ? listTagsFor(
                  tag,
                  results,
                  resolve,
                  options?.args as { filter?: SingleOrArray<Record<string, unknown>> } | undefined
              )
            : [];

    // Also tag by query args in case the result is empty (eg. 404)
    const argId =
        options?.args !== undefined
            ? (defaultIdFuncs[tag] as (args: unknown) => string | number | undefined)(options.args)
            : undefined;
    const argTag = argId !== undefined && !resultTags.some((t) => t.id === argId) ? [{ type: tag, id: argId }] : [];

    return [...resultTags, ...listTags, ...argTag];
}

// Every tag a change to this resource could affect: its own identity tag, plus its full ancestor scope chain.
function tagsForResource<K extends ResourceType>(type: K, resource: ResourceDataMap[K]): PendingTag[] {
    const id = resourceIdFuncs[type](resource);
    return [{ type, id }, ...listScopeTagsFromId(type, id)];
}

// Pending-tag queue driving the "data outdated" toast; refreshToast.tsx subscribes to show/hide it.
const pendingTags = new Set<string>();
const pendingListeners = new Set<() => void>();

function notifyPendingListeners() {
    pendingListeners.forEach((listener) => listener());
}

export function subscribeToPending(listener: () => void): () => void {
    pendingListeners.add(listener);
    return () => pendingListeners.delete(listener);
}

export function hasPendingTags(): boolean {
    return pendingTags.size > 0;
}

function queuePending(tags: PendingTag[]) {
    tags.forEach((tag) => pendingTags.add(JSON.stringify(tag)));
    notifyPendingListeners();
}

// Unlike flushPending, doesn't notify listeners - used by the refresh toast button, which closes its own toast.
export function dispatchPendingTags(): void {
    if (pendingTags.size === 0) {
        return;
    }
    const tags = Array.from(pendingTags).map((tag) => JSON.parse(tag) as PendingTag);
    pendingTags.clear();
    store.dispatch(api.util.invalidateTags(tags));
}

/** Commits every currently-queued tag and notifies listeners (closing the toast). Called on navigation. */
export function flushPending(): void {
    if (pendingTags.size === 0) {
        return;
    }
    dispatchPendingTags();
    notifyPendingListeners();
}

/** True if anything currently on screen is actively subscribed to one of these tags (not just cached). */
function hasActiveSubscriber(tags: PendingTag[]): boolean {
    const affectedQueries = api.util.selectInvalidatedBy(store.getState(), tags);
    const subscriptions = (
        store.getState() as unknown as { api: { subscriptions: Record<string, Record<string, unknown>> } }
    ).api.subscriptions;

    return affectedQueries.some(({ queryCacheKey }) => Object.keys(subscriptions[queryCacheKey] ?? {}).length > 0);
}

// Per-component overrides of tag-manager behaviour
export type TagManagerOverrides = {
    autoRefresh?: boolean;
};

const activeOverrides: TagManagerOverrides[] = [];

export function registerTagManagerOverride(overrides: TagManagerOverrides): () => void {
    activeOverrides.push(overrides);
    return () => {
        const index = activeOverrides.indexOf(overrides);
        if (index !== -1) activeOverrides.splice(index, 1);
    };
}

function getTagManagerOverrides(): Required<TagManagerOverrides> {
    return {
        autoRefresh: activeOverrides.some((overrides) => overrides.autoRefresh === true)
    };
}

// Queues for user-confirmed refresh if subscribed, otherwise invalidates immediately (always immediate under autoRefresh).
export function invalidateFor<K extends ResourceType>(type: K, resource: ResourceDataMap[K]): void {
    const tags = tagsForResource(type, resource);

    if (!getTagManagerOverrides().autoRefresh && hasActiveSubscriber(tags)) {
        queuePending(tags);
    } else {
        store.dispatch(api.util.invalidateTags(tags));
    }
}
