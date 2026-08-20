import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { SSEEvent } from "server/types";
import { ResourceDataMap, ResourceType, resourceIdFuncs } from "common/resources";
import { DeepPartial } from "common/types";
import api from "../api";
import { store } from "../api/store";
import { getConnectionId } from "../api/connectionId";
import { flushPending, invalidateFor, tagTypes } from "../api/tagManager";
import { useRefreshToast } from "./refreshToast";
import { useProactiveRefresh } from "../hooks/useProactiveRefresh";
import { mergeWith, isPlainObject } from "lodash-es";
import { refreshSession } from "../api/refresh";
import { emitLogCreate, emitResync, hasLogListeners } from "../pages/admin/logs/logStream";
import { ILogEntry } from "common/models/logs";

function updateCachedEntity<T extends object>(draft: unknown, matchFn: (entity: T) => boolean, data: DeepPartial<T>) {
    const update = (entity: T) =>
        mergeWith(entity, data, (_entityVal, dataVal) => {
            if (Array.isArray(dataVal)) return dataVal;
            if (isPlainObject(dataVal) && Object.keys(dataVal).length === 0) return {};
        });

    if (Array.isArray(draft)) {
        const entity = (draft as T[]).find(matchFn);
        if (entity) update(entity);
    } else if (draft !== null && typeof draft === "object" && "items" in draft) {
        const entity = (draft as { items: T[] }).items.find(matchFn);
        if (entity) update(entity);
    } else {
        update(draft as T);
    }
}

function handlePatch<K extends ResourceType>(type: K, items: { id: string; data: DeepPartial<ResourceDataMap[K]> }[]) {
    const idFunc = resourceIdFuncs[type];

    items.forEach(({ id, data }) => {
        if (!data || Object.keys(data).length === 0) return;

        const invalidated = api.util.selectInvalidatedBy(store.getState(), [{ type, id }]);
        invalidated.forEach(({ endpointName, originalArgs }) => {
            try {
                store.dispatch(
                    api.util.updateQueryData(endpointName as never, originalArgs as never, (draft) => {
                        updateCachedEntity(draft, (entity) => idFunc(entity as ResourceDataMap[K]) === id, data);
                    })
                );
            } catch (error) {
                console.error(`SSE cache update failed for "${type}" id "${id}"`, error);
            }
        });
    });
}

function handleMePatch(data: DeepPartial<ResourceDataMap["user"]>) {
    if (!data || Object.keys(data).length === 0) return;

    const invalidated = api.util.selectInvalidatedBy(store.getState(), [{ type: "me" }]);
    invalidated.forEach(({ endpointName, originalArgs }) => {
        try {
            store.dispatch(
                api.util.updateQueryData(endpointName as never, originalArgs as never, (draft) => {
                    updateCachedEntity<ResourceDataMap["user"]>(draft, () => true, data);
                })
            );
        } catch (error) {
            console.error('SSE cache update failed for "me"', error);
        }
    });
}

const reconnectTags = tagTypes.map((type) => ({ type }));

export function SSEProvider({ children }: { children: React.ReactNode }) {
    const esRef = useRef<EventSource | null>(null);
    const hasConnected = useRef(false);
    const { pathname } = useLocation();
    const isFirstRender = useRef(true);

    useRefreshToast();
    useProactiveRefresh();

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        flushPending();
    }, [pathname]);

    useEffect(() => {
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        let retryAttempt = 0;
        let cancelled = false;

        function handleOpen() {
            retryAttempt = 0;
            if (hasConnected.current) {
                store.dispatch(api.util.invalidateTags(reconnectTags));
                emitResync();
            }
            hasConnected.current = true;
        }

        // Allows recovery when access token expires/closes
        async function recover() {
            const outcome = await refreshSession();
            if (cancelled) {
                return;
            }

            if (outcome === "expired") {
                store.dispatch(api.util.invalidateTags([{ type: "me" }]));
                return;
            }

            const delay = Math.min(30000, 1000 * 2 ** retryAttempt);
            retryAttempt++;
            retryTimer = setTimeout(() => {
                if (!cancelled) {
                    reconnect();
                }
            }, delay);
        }

        function handleError() {
            if (esRef.current?.readyState !== EventSource.CLOSED) {
                console.warn("SSE connection lost, awaiting reconnect");
                return;
            }
            void recover();
        }

        function handleMessage(e: MessageEvent) {
            const event = JSON.parse(e.data) as SSEEvent;

            if (event.status === "connected") {
                return;
            }

            if (event.status === "complete") {
                handlePatch(event.type as ResourceType, [
                    { id: event.id, data: event.data as DeepPartial<ResourceDataMap[ResourceType]> }
                ]);
                return;
            }

            if (
                (event.status === "create" || event.status === "update" || event.status === "delete") &&
                event.originId !== undefined &&
                event.originId === getConnectionId()
            ) {
                if (!event.deferred) {
                    return;
                }
                const type = event.type as ResourceType;
                event.items.forEach(({ data }) =>
                    invalidateFor(type, data as ResourceDataMap[typeof type], { immediate: true })
                );
                return;
            }

            if (event.status === "update") {
                const type = event.type as ResourceType;
                const items = event.items as { id: string; data: DeepPartial<ResourceDataMap[ResourceType]> }[];

                if (event.type === "user") {
                    const me = api.endpoints.getMe.select()(store.getState()).data;
                    if (me) {
                        const myItem = items.find(({ id }) => id === resourceIdFuncs.user(me));
                        if (myItem) handleMePatch(myItem.data as DeepPartial<ResourceDataMap["user"]>);
                    }
                }

                items.forEach(({ data }) => invalidateFor(type, data as ResourceDataMap[ResourceType]));
            } else if (event.status === "create") {
                const type = event.type as ResourceType;

                event.items.forEach(({ data }) => {
                    // Mounted Logs page merges live; otherwise fall back to cache invalidation.
                    if (type === "log" && hasLogListeners()) {
                        emitLogCreate(data as ILogEntry);
                    } else {
                        invalidateFor(type, data as ResourceDataMap[typeof type]);
                    }
                });
            } else if (event.status === "delete") {
                const type = event.type as ResourceType;

                if (event.type === "user") {
                    const me = api.endpoints.getMe.select()(store.getState()).data;
                    if (me && event.items.some(({ id }) => id === resourceIdFuncs.user(me))) {
                        store.dispatch(api.util.invalidateTags([{ type: "me" }]));
                    }
                }

                event.items.forEach(({ data }) => invalidateFor(type, data as ResourceDataMap[typeof type]));
            }
        }

        function connect() {
            const es = new EventSource("/api/v1/broadcast", { withCredentials: true });
            esRef.current = es;
            es.addEventListener("open", handleOpen);
            es.addEventListener("error", handleError);
            es.addEventListener("message", handleMessage);
        }

        function reconnect() {
            clearTimeout(retryTimer);
            esRef.current?.close();
            connect();
        }

        // Chromium-only (Page Lifecycle API); EventSource callbacks are suspended while frozen, so resume is the reliable signal.
        function handleResume() {
            reconnect();
        }

        // Firefox/Safari fallback: re-check readyState on visibility instead.
        function handleVisibilityChange() {
            if (document.visibilityState === "visible" && esRef.current?.readyState !== EventSource.OPEN) {
                reconnect();
            }
        }

        connect();

        const supportsPageLifecycle = "onfreeze" in document;
        if (supportsPageLifecycle) {
            document.addEventListener("resume", handleResume);
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
            esRef.current?.close();
            if (supportsPageLifecycle) {
                document.removeEventListener("resume", handleResume);
            }
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

    return children;
}
