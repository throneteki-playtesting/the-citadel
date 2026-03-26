import { Response } from "express";
import { SyncCompleteEvent, SyncEvent, SyncOperation, SyncType } from "@/types";

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
    complete: (data: SyncCompleteEvent<K>["data"]) => void,
    error: (error: string) => void,
}

export function createSyncEmitter<K extends SyncType>(type: K, operation: SyncOperation<K>, resourceId: string): SyncEmitter<K> {
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
        complete: (data: SyncCompleteEvent<K>["data"]) =>
            emit({ type, id: resourceId, operation, status: "complete", data }),
        error: (error: string) =>
            emit({ type, id: resourceId, operation, status: "error", error })
    };
}