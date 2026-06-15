import { useEffect, useRef } from "react";
import { SyncCompleteEvent, SyncEvent, SyncType } from "server/types";
import api from "../api";
import { store } from "../api/store";
import { SSEContext } from "./sseContext";
import { mergeWith, isPlainObject } from "lodash-es";
import { IPlaytestCard } from "common/models/cards";
import { IPlaytestingUpdate } from "common/models/projects";
import { DeepPartial } from "common/types";
import { IPlaytestReview } from "common/models/reviews";

type SyncHandlers = {
    [K in SyncType]?: (event: SyncCompleteEvent<K>) => void;
};

/**
 * Handlers for SSE "complete" sync events, keyed by entity type.
 * When the server broadcasts a change, the relevant handler updates
 * any matching RTK Query cache entries in-place, avoiding a full refetch.
 */
const syncCompleteHandlers: SyncHandlers = {
    card: (event) => {
        if (!event.data || Object.keys(event.data).length === 0) return;

        const state = store.getState();
        const invalidated = api.util.selectInvalidatedBy(state, [{ type: "card", id: event.id }]);
        const [project, number, version] = event.id.split("|");

        invalidated.forEach(({ endpointName, originalArgs }) => {
            try {
                store.dispatch(
                    api.util.updateQueryData(endpointName as never, originalArgs as never, (draft) => {
                        updateCachedEntity<IPlaytestCard>(
                            draft,
                            (c) => c.project === Number(project) && c.number === Number(number) && c.version === version,
                            event.data
                        );
                    })
                );
            } catch (error) {
                console.error(
                    `SSE cache update failed: received "${endpointName}" update for id "${event.id}" but could not apply patch to cache.`,
                    error
                );
            }
        });
    },
    review: (event) => {
        if (!event.data || Object.keys(event.data).length === 0) return;

        const state = store.getState();
        const invalidated = api.util.selectInvalidatedBy(state, [{ type: "review", id: event.id }]);
        const [project, number, version, reviewer] = event.id.split("|");

        invalidated.forEach(({ endpointName, originalArgs }) => {
            try {
                store.dispatch(
                    api.util.updateQueryData(endpointName as never, originalArgs as never, (draft) => {
                        updateCachedEntity<IPlaytestReview>(
                            draft,
                            (u) => u.project === Number(project) && u.number === Number(number) && u.version === version && u.reviewer === reviewer,
                            event.data
                        );
                    })
                );
            } catch (error) {
                console.error(
                    `SSE cache update failed: received "${endpointName}" update for id "${event.id}" but could not apply patch to cache.`,
                    error
                );
            }
        });
    },
    playtestingUpdate: (event) => {
        if (!event.data || Object.keys(event.data).length === 0) return;

        const state = store.getState();
        const invalidated = api.util.selectInvalidatedBy(state, [{ type: "playtestingUpdate", id: event.id }]);
        const [project, version] = event.id.split("|");

        invalidated.forEach(({ endpointName, originalArgs }) => {
            try {
                store.dispatch(
                    api.util.updateQueryData(endpointName as never, originalArgs as never, (draft) => {
                        updateCachedEntity<IPlaytestingUpdate>(
                            draft,
                            (u) => u.project === Number(project) && u.version === Number(version),
                            event.data
                        );
                    })
                );
            } catch (error) {
                console.error(
                    `SSE cache update failed: received "${endpointName}" update for id "${event.id}" but could not apply patch to cache.`,
                    error
                );
            }
        });
    }
};
// Generic helper to update a matching entity across any cache draft shape
const updateCachedEntity = <T extends object>(
    draft: unknown,
    matchFn: (entity: T) => boolean,
    data: DeepPartial<T>
) => {
    const update = (entity: T) => mergeWith(entity, data, (_entityVal, dataVal) => {
        if (isPlainObject(dataVal) && Object.keys(dataVal).length === 0) {
            return {};
        }
    });

    if (Array.isArray(draft)) {
        const entity = (draft as T[]).find(matchFn);
        if (entity) update(entity);
    } else if (draft !== null && typeof draft === "object" && "items" in draft) {
        const entity = (draft as { items: T[] }).items.find(matchFn);
        if (entity) update(entity);
    } else {
        update(draft as unknown as T);
    }
};

export function SSEProvider({ children }: { children: React.ReactNode }) {
    const esRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const es = new EventSource("/api/v1/broadcast", { withCredentials: true });
        esRef.current = es;

        es.addEventListener("message", (e) => {
            const event = JSON.parse(e.data) as SyncEvent;
            if (event.status === "complete") {
                handleComplete(event);
            }
        });

        return () => {
            es.close();
        };
    }, []);

    return <SSEContext.Provider value={undefined}>{children}</SSEContext.Provider>;
}

function handleComplete<K extends SyncType>(event: SyncCompleteEvent<K>) {
    const handler = syncCompleteHandlers[event.type] as ((event: SyncCompleteEvent<K>) => void) | undefined;
    handler?.(event);
}