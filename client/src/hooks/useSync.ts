import { SemanticVersion } from "common/utils";
import { useState, useEffect } from "react";
import { SyncStatus, SyncType, SyncOperation } from "server/types";

export interface SyncState {
    status?: SyncStatus;
    step?: string;
    error?: string;
}

// Converts a union A | B into an intersection A & B via contravariant inference
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
// Converts a dot-notation string key into a nested object type, e.g. "a.b.c" → { a: { b: { c: V } } }
type DotNested<K extends string, V> = K extends `${infer Head}.${infer Tail}`
    ? { [P in Head]: DotNested<Tail, V> }
    : { [P in K]: V };
// Builds the full nested SyncState shape for all operations of a given SyncType
type SyncListenerState<K extends SyncType> = UnionToIntersection<DotNested<SyncOperation<K>, SyncState>>;

const defaultStates: { [K in SyncType]: SyncListenerState<K> } = {
    card: { image: {}, discord: {}, github: {} },
    review: { discord: {} },
    playtestingUpdate: { github: { code: {}, data: {} }, discord: {} },
    release: { github: { data: {} } }
};

// One level of keyed SyncState, e.g. { code: SyncState, data: SyncState }
type FlatState = Record<string, SyncState>;
// Top-level state keyed by operation prefix, values are either a SyncState or a FlatState one level deeper
type NestedState = Record<string, SyncState | FlatState>;

// Routing table: maps "${type}/${id}" to per-resource state + listeners
type ResourceEntry = {
    state: NestedState;
    listeners: Set<() => void>;
};
const registry = new Map<string, ResourceEntry>();

// Singleton progress EventSource shared across all mounted sync hooks
let progressES: EventSource | null = null;
let progressRefCount = 0;

function getAtPath(state: NestedState, [head, tail]: string[]): SyncState {
    return (tail ? (state[head] as FlatState)?.[tail] : (state[head] as SyncState)) ?? {};
}

function setAtPath(state: NestedState, [head, tail]: string[], value: SyncState): NestedState {
    if (!tail) return { ...state, [head]: value };
    return { ...state, [head]: { ...(state[head] as FlatState), [tail]: value } };
}

function connectProgress() {
    if (!progressES) {
        progressES = new EventSource("/api/v1/broadcast/progress", { withCredentials: true });

        progressES.addEventListener("message", (e) => {
            const event = JSON.parse(e.data);
            const { type, id, operation, status } = event;
            const entry = registry.get(`${type}/${id}`);
            if (!entry) return;

            const path = (operation as string).split(".");

            let partial: Partial<SyncState>;
            switch (status as SyncStatus) {
                case "start":
                    partial = { status: "start" };
                    break;
                case "progress":
                    partial = { status: "progress", step: event.step };
                    break;
                case "complete":
                    partial = { status: "complete" };
                    break;
                case "error":
                    partial = { status: "error", error: event.error };
                    break;
                default:
                    return;
            }

            entry.state = setAtPath(entry.state, path, { ...getAtPath(entry.state, path), ...partial });
            entry.listeners.forEach((l) => l());
        });
    }
    progressRefCount++;
}

function disconnectProgress() {
    progressRefCount--;
    if (progressRefCount === 0) {
        progressES?.close();
        progressES = null;
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
            registry.set(key, { state: { ...(defaultStates[type] as NestedState) }, listeners: new Set() });
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

export function useCardSync(card?: { project: number; number: number; version: SemanticVersion }) {
    const id = card ? `${card.project}|${card.number}|${card.version}` : undefined;
    return useSyncListener("card", id);
}
export function useReviewSync(review?: {
    project: number;
    number: number;
    version: SemanticVersion;
    reviewer: string;
}) {
    const id = review ? `${review.project}|${review.number}|${review.version}|${review.reviewer}` : undefined;
    return useSyncListener("review", id);
}
export function usePlaytestingUpdateSync(playtestingUpdate?: { project: number; version: number }) {
    const id = playtestingUpdate ? `${playtestingUpdate.project}|${playtestingUpdate?.version}` : undefined;
    return useSyncListener("playtestingUpdate", id);
}
export function useReleaseSync(release?: { project: number; code: string }) {
    const id = release ? `${release.project}|${release.code}` : undefined;
    return useSyncListener("release", id);
}
