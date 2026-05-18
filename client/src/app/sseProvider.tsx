import { useEffect, useRef } from "react";
import { SyncCompleteEvent, SyncEvent, SyncType } from "server/types";
import api from "../api";
import { store } from "../api/store";
import { SSEContext } from "./sseContext";

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
        const [project, number, version] = event.id.split("|");
        const cardId = { project: Number(project), number: Number(number), version };

        const state = store.getState();
        const cachedArgs = api.util.selectCachedArgsForQuery(state, "getCards");

        cachedArgs.forEach((args) => {
            store.dispatch(
                api.util.updateQueryData("getCards", args, (draft) => {
                    const index = draft.items.findIndex(c =>
                        c.project === cardId.project &&
                        c.number === cardId.number &&
                        c.version === cardId.version
                    );
                    if (index !== -1) {
                        draft.items[index] = event.data;
                    }
                })
            );
        });
    },
    playtestingUpdate: (event) => {
        const [project, version] = event.id.split("|");
        const updateId = { project: Number(project), version: Number(version) };

        const state = store.getState();

        // Update paginated list
        const cachedListArgs = api.util.selectCachedArgsForQuery(state, "getPlaytestingUpdates");
        cachedListArgs.forEach((args) => {
            store.dispatch(
                api.util.updateQueryData("getPlaytestingUpdates", args, (draft) => {
                    const index = draft.items.findIndex(u =>
                        u.project === updateId.project &&
                        u.version === updateId.version
                    );
                    if (index !== -1) {
                        draft.items[index] = event.data;
                    }
                })
            );
        });

        // Update singular cached query if it matches
        const cachedSingleArgs = api.util.selectCachedArgsForQuery(state, "getPlaytestingUpdate");
        cachedSingleArgs.forEach((args) => {
            store.dispatch(
                api.util.updateQueryData("getPlaytestingUpdate", args, (draft) => {
                    if (draft.project === updateId.project && draft.version === updateId.version) {
                        return event.data;
                    }
                })
            );
        });
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

        es.onerror = () => {
            es.close();
        };

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