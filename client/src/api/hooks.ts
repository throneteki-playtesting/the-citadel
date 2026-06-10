import { useEffect, useMemo, useRef, useState } from "react";
import { Explodable, Filter, isOperatorObject, SingleOrArray } from "common/types";
import { SyncOperation, SyncStatus, SyncType } from "server/types";
import { SemanticVersion, validate, ValidationStep } from "common/utils";
import { User } from "common/models/auth";
import { useSelector } from "react-redux";
import { RootState } from "./store";
import { useLocation } from "react-router-dom";

function isIterable(v: unknown): v is Iterable<unknown> {
    return (
        v != null &&
        typeof v !== "string" &&
        typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
    );
}

function cartesianProduct(obj: Filter<object>): Record<string, unknown>[] | undefined {
    const worker = (input: unknown): Record<string, unknown>[] | undefined => {
        if (input == null || typeof input !== "object") return undefined;

        if (isOperatorObject(input)) return [input as Record<string, unknown>];

        const entries = Object.entries(input as Record<string, unknown>).filter(([, v]) => {
            if (v == null) return false;
            if (isOperatorObject(v)) return true;
            if (isIterable(v)) return Array.from(v as Iterable<unknown>).length > 0;
            if (typeof v !== "object") return true;
            return worker(v) !== undefined;
        });

        if (entries.length === 0) return undefined;

        return entries.reduce<Record<string, unknown>[]>((acc, [key, v]) => {
            if (isOperatorObject(v)) {
                return acc.map(item => ({ ...item, [key]: v }));
            }

            if (isIterable(v)) {
                const values = Array.from(v as Iterable<unknown>);
                return acc.flatMap(item => values.map(val => ({ ...item, [key]: val })));
            }

            if (typeof v !== "object") {
                return acc.map(item => ({ ...item, [key]: v }));
            }

            const nested = worker(v);
            if (!nested) return acc;
            return acc.flatMap(item => nested.map(n => ({ ...item, [key]: n })));
        }, [{}]);
    };

    return worker(obj);
}

export function useFilter<T extends object>(
    filter?: SingleOrArray<Explodable<T>>
): Filter<T>[] | undefined {
    return useMemo(() => {
        if (!filter) return undefined;

        if (Array.isArray(filter)) {
            const results = filter.flatMap(f => cartesianProduct(f as Filter<object>) ?? [{}]);
            return results as Filter<T>[];
        }

        return (cartesianProduct(filter as Filter<object>) ?? [{}]) as Filter<T>[];
    }, [filter]);
}

export function usePermission(...requires: ValidationStep<User>[]) {
    const user = useSelector((state: RootState) => state.auth.user);
    return validate(user, ...requires);
}

export const useTimezone = () => {
    const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

    const format = (date: Date, options?: Intl.DateTimeFormatOptions) => {
        return date.toLocaleString(navigator.language, {
            timeZone: timezone,
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            ...options
        });
    };

    return { timezone, format };
};

export function usePageTitle(title?: string) {
    useEffect(() => {
        document.title = title ? `The Citadel - ${title}` : "The Citadel";
        return () => { document.title = "The Citadel"; }; // reset on unmount
    }, [title]);
}

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
    playtestingUpdate: {
        github: {}
    }
};

export function useSyncListener<K extends SyncType>(type: K, id?: string) {
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
export function usePlaytestingUpdateSync(playtestingUpdate?: { project: number, version: number }) {
    const id = playtestingUpdate ? `${playtestingUpdate.project}|${playtestingUpdate?.version}` : undefined;
    return useSyncListener("playtestingUpdate", id);
}

type SwipeDirection = "up" | "down" | "left" | "right";

export const useSwipe = (onSwipe: (direction: SwipeDirection) => void, tolerance = 50) => {
    const startX = useRef<number>(0);
    const startY = useRef<number>(0);

    return {
        onTouchStart: (e: React.TouchEvent) => {
            startX.current = e.touches[0].clientX;
            startY.current = e.touches[0].clientY;
        },
        onTouchEnd: (e: React.TouchEvent) => {
            const diffX = e.changedTouches[0].clientX - startX.current;
            const diffY = e.changedTouches[0].clientY - startY.current;

            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (Math.abs(diffX) > tolerance) {
                    e.preventDefault();
                    onSwipe(diffX < 0 ? "left" : "right");
                }
            } else if (Math.abs(diffY) > tolerance) {
                e.preventDefault();
                onSwipe(diffY < 0 ? "up" : "down");
            }
        }
    };
};

export function useHighlightOnMount<T extends HTMLElement>(targetId: string) {
    const { state } = useLocation();
    const ref = useRef<T | null>(null);
    const [isHighlighted, setIsHighlighted] = useState(false);

    useEffect(() => {
        if (state?.highlight !== targetId || !ref.current) return;

        ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
        setIsHighlighted(true);

        const timer = setTimeout(() => setIsHighlighted(false), 2000);
        return () => clearTimeout(timer);
    }, [state, targetId]);

    return { ref: ref as React.RefObject<T>, isHighlighted };
}