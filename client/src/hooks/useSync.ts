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

function useSyncListener<K extends SyncType>(type: K, id?: string) {
    const [syncStates, setSyncStates] = useState<SyncListenerState<K>>(defaultStates[type]);

    useEffect(() => {
        if (!id) {
            return;
        }
        const es = new EventSource(`/api/v1/broadcast/progress/${type}/${id}`, { withCredentials: true });

        const update = (operation: SyncOperation<K>, partial: Partial<SyncState>) =>
            setSyncStates(s => ({
                ...s,
                [operation]: { ...s[operation], ...partial }
            }));

        es.addEventListener("message", (e) => {
            const event = JSON.parse(e.data);
            const { operation, status } = event;

            switch (status as SyncStatus) {
                case "start": update(operation, { status: "start" }); break;
                case "progress": update(operation, { status: "progress", step: event.step }); break;
                case "complete": update(operation, { status: "complete" }); break;
                case "error": update(operation, { status: "error", error: event.error }); break;
            }
        });

        return () => es.close();
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