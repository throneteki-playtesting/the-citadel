import { mergeWith, isPlainObject } from "lodash-es";
import { ResourceDataMap, ResourceType, resourceIdFuncs } from "common/resources";
import { DeepPartial } from "common/types";
import api from "./index";
import { store } from "./store";

// A cached query result is either the entity itself, a bare array of them, or a paged
// `{ items: T[] }` response - this is every shape those queries actually come in.
function findAndMutateEntity<T extends object>(
    draft: unknown,
    matchFn: (entity: T) => boolean,
    mutate: (entity: T) => void
) {
    if (Array.isArray(draft)) {
        const entity = (draft as T[]).find(matchFn);
        if (entity) mutate(entity);
    } else if (draft !== null && typeof draft === "object" && "items" in draft) {
        const entity = (draft as { items: T[] }).items.find(matchFn);
        if (entity) mutate(entity);
    } else {
        mutate(draft as T);
    }
}

/** Merges `data` onto `entity` in place - arrays replace wholesale, an empty object clears rather
 *  than no-ops (mergeWith otherwise treats `{}` as "nothing to merge" and leaves stale keys behind). */
export function mergeCachedEntity<T extends object>(entity: T, data: DeepPartial<T>) {
    mergeWith(entity, data, (_entityVal, dataVal) => {
        if (Array.isArray(dataVal)) return dataVal;
        if (isPlainObject(dataVal) && Object.keys(dataVal).length === 0) return {};
    });
}

/** Patches every currently-cached query holding this entity, across every endpoint providing its
 *  tag. `mutate` gets the live Immer draft directly, so it can do anything a plain merge can't. */
export function patchEntityEverywhere<K extends ResourceType>(
    type: K,
    id: string,
    mutate: (entity: ResourceDataMap[K]) => void
) {
    const idFunc = resourceIdFuncs[type];
    const invalidated = api.util.selectInvalidatedBy(store.getState(), [{ type, id }]);
    return invalidated.map(({ endpointName, originalArgs }) =>
        store.dispatch(
            api.util.updateQueryData(endpointName as never, originalArgs as never, (draft) => {
                findAndMutateEntity(draft, (entity) => idFunc(entity as ResourceDataMap[K]) === id, mutate);
            })
        )
    );
}
