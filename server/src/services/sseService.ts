import { Response } from "express";
import { SyncDataMap, SyncEvent, SyncOperation, SyncType } from "@/types";
import { getDiff } from "common/utils";
import { cloneDeep } from "lodash-es";

interface SseClient {
    id: string;
    res: Response;
}

interface SseProgressClient extends SseClient {
    type: SyncType;
    resourceId: string;
}

const broadcastClients = new Map<string, SseClient>();
const progressClients = new Map<string, SseProgressClient>();

function sendEvent(res: Response, event: SyncEvent<SyncType>) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export const sseService = {
    addBroadcastClient(id: string, res: Response) {
        broadcastClients.set(id, { id, res });
    },

    removeBroadcastClient(id: string) {
        broadcastClients.delete(id);
    },

    addProgressClient(id: string, type: SyncType, resourceId: string, res: Response) {
        progressClients.set(id, { id, res, type, resourceId });
    },

    removeProgressClient(id: string) {
        progressClients.delete(id);
    },

    broadcast(event: SyncEvent<SyncType>) {
        broadcastClients.forEach(({ res }) => sendEvent(res, event));
    },

    sendProgress(type: SyncType, resourceId: string, event: SyncEvent<SyncType>) {
        progressClients.forEach((client) => {
            if (client.type === type && client.resourceId === resourceId) {
                sendEvent(client.res, event);
            }
        });
    }
};

export interface SyncEmitter<K extends SyncType> {
    start: () => void,
    progress: (step: string) => void,
    complete: (data: SyncDataMap[K]) => void,
    error: (error: string) => void,
}

const resourceIdFunc: { [K in SyncType]: (result: SyncDataMap[K]) => string } = {
    card: (card) => `${card.project}|${card.number}|${card.version}`,
    review: (review) => `${review.project}|${review.number}|${review.version}|${review.reviewer}`,
    playtestingUpdate: (playtestingUpdate) => `${playtestingUpdate.project}|${playtestingUpdate.version}`
};

export function createSyncEmitter<K extends SyncType>(type: K, operation: SyncOperation<K>, resource: SyncDataMap[K]): SyncEmitter<K> {
    const initialResource = cloneDeep(resource);
    const resourceId = resourceIdFunc[type](initialResource);
    const emit = (event: SyncEvent<K>) => {
        sseService.sendProgress(type, resourceId, event);
        if (event.status === "complete" || event.status === "error") {
            sseService.broadcast(event);
        }
    };

    return {
        start: () =>
            emit({ type, id: resourceId, operation, status: "start" }),
        progress: (step: string) =>
            emit({ type, id: resourceId, operation, status: "progress", step }),
        complete: (data: SyncDataMap[K]) =>
            emit({ type, id: resourceId, operation, status: "complete", data: getDiff(initialResource, data) }),
        error: (error: string) =>
            emit({ type, id: resourceId, operation, status: "error", error })
    };
}