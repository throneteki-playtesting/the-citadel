import { SemanticVersion } from "common/utils";
import { useState, useEffect } from "react";
import { SyncStatus, SyncType, SyncOperation } from "server/types";

interface SyncState {
    status?: SyncStatus;
    step?: string;
    error?: string;
}

type SyncListenerState<K extends SyncType> = Record<SyncOperation<K>, SyncState>;

const defaultStates: { [K in SyncType]: SyncListenerState<K> } = {
    card: {
        image: {},
        discord: {},
        github: {}
    },
    review: {
        discord: {}
    },
    playtestingUpdate: {
        github: {}
    }
};

// Routing table: maps "${type}/${id}" to per-resource state + listeners
type ResourceEntry = {
    state: Record<string, SyncState>;
    listeners: Set<() => void>;
};
const registry = new Map<string, ResourceEntry>();

// Singleton progress EventSource shared across all mounted sync hooks
let progressEs: EventSource | null = null;
let progressRefCount = 0;

function connectProgress() {
    if (!progressEs) {
        progressEs = new EventSource("/api/v1/broadcast/progress", { withCredentials: true });

        progressEs.addEventListener("message", (e) => {
            const event = JSON.parse(e.data);
            const { type, id, operation, status } = event;
            const entry = registry.get(`${type}/${id}`);
            if (!entry) return;

            const update = (partial: Partial<SyncState>) => {
                entry.state = { ...entry.state, [operation]: { ...entry.state[operation], ...partial } };
                entry.listeners.forEach(l => l());
            };

            switch (status as SyncStatus) {
                case "start": update({ status: "start" }); break;
                case "progress": update({ status: "progress", step: event.step }); break;
                case "complete": update({ status: "complete" }); break;
                case "error": update({ status: "error", error: event.error }); break;
            }
        });
    }
    progressRefCount++;
}

function disconnectProgress() {
    progressRefCount--;
    if (progressRefCount === 0) {
        progressEs?.close();
        progressEs = null;
    }
}

function useSyncListener<K extends SyncType>(type: K, id?: string) {
    const [syncStates, setSyncStates] = useState<SyncListenerState<K>>(() => {
        if (!id) return defaultStates[type];
        const key = `${type}/${id}`;
        return (registry.get(key)?.state ?? defaultStates[type]) as SyncListenerState<K>;
    });

    useEffect(() => {
        if (!id) return;
        const key = `${type}/${id}`;

        if (!registry.has(key)) {
            registry.set(key, { state: { ...defaultStates[type] }, listeners: new Set() });
        }

        const entry = registry.get(key)!;
        connectProgress();

        const listener = () => setSyncStates(entry.state as SyncListenerState<K>);
        entry.listeners.add(listener);
        // Sync current state immediately in case events fired between render and this effect
        setSyncStates(entry.state as SyncListenerState<K>);

        return () => {
            entry.listeners.delete(listener);
            if (entry.listeners.size === 0) {
                registry.delete(key);
            }
            disconnectProgress();
        };
    }, [type, id]);

    return syncStates;
}

export function useCardSync(card?: { project: number, number: number, version: SemanticVersion }) {
    const id = card ? `${card.project}|${card.number}|${card.version}` : undefined;
    return useSyncListener("card", id);
}
export function useReviewSync(review?: { project: number, number: number, version: SemanticVersion, reviewer: string }) {
    const id = review ? `${review.project}|${review.number}|${review.version}|${review.reviewer}` : undefined;
    return useSyncListener("review", id);
}
export function usePlaytestingUpdateSync(playtestingUpdate?: { project: number, version: number }) {
    const id = playtestingUpdate ? `${playtestingUpdate.project}|${playtestingUpdate?.version}` : undefined;
    return useSyncListener("playtestingUpdate", id);
}
