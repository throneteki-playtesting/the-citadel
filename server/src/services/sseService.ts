import { Response } from "express";
import { SSEEvent, SyncDataMap, SyncEvent, SyncOperation, SyncType } from "@/types";
import { ResourceDataMap, ResourceType, resourceIdFuncs } from "common/resources";
import { SingleOrArray } from "common/types";
import { asArray, getDiff } from "common/utils";
import { cloneDeep } from "lodash-es";
import { logger } from "@/services";
import { requestContext } from "@/middleware/context";

interface SseClient {
    id: string;
    res: Response;
}

const broadcastClients = new Map<string, SseClient>();
const progressClients = new Map<string, SseClient>();

function sendEvent(res: Response, event: SSEEvent) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export const sseService = {
    addBroadcastClient(id: string, res: Response) {
        broadcastClients.set(id, { id, res });
    },

    removeBroadcastClient(id: string) {
        broadcastClients.delete(id);
    },

    addProgressClient(id: string, res: Response) {
        progressClients.set(id, { id, res });
    },

    removeProgressClient(id: string) {
        progressClients.delete(id);
    },

    broadcast(event: SSEEvent) {
        logger.verbose(`[SSE] Broadcasting to ${broadcastClients.size} client(s): ${JSON.stringify(event)}`);
        broadcastClients.forEach(({ res }) => sendEvent(res, event));
    },

    sendProgress(event: SyncEvent<SyncType>) {
        logger.verbose(`[SSE] Sending progress to ${progressClients.size} client(s): ${JSON.stringify(event)}`);
        progressClients.forEach(({ res }) => sendEvent(res, event));
    },

    sendConnected(res: Response, id: string) {
        sendEvent(res, { status: "connected", id });
    }
};

export interface SyncEmitter<K extends SyncType> {
    start: () => void,
    progress: (step: string) => void,
    complete: (data: SyncDataMap[K]) => void,
    error: (error: string) => void
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
        sseService.sendProgress(event);
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

export function broadcastResourceChange<K extends ResourceType>(
    type: K,
    resources: SingleOrArray<ResourceDataMap[K]>,
    status: "create" | "update" | "delete" = "update"
): void {
    const items = asArray(resources).map(resource => ({
        id: resourceIdFuncs[type](resource),
        data: resource
    }));
    const context = requestContext.getStore();
    const originId = context?.source === "client" ? context.clientId : undefined;
    sseService.broadcast({ type, status, items, originId });
}
