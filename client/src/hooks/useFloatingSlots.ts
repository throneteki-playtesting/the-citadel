import { useLayoutEffect, useSyncExternalStore } from "react";

// Which places along the bottom right a page's floating buttons hold - 0 beside the edge, then one more for each button
// further left - kept outside React so a button and a guide never need to know of each other
const occupied = new Map<number, number>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
};

/** Holds a place along the bottom right for as long as the calling component is mounted */
export function useFloatingSlot(index: number) {
    useLayoutEffect(() => {
        occupied.set(index, (occupied.get(index) ?? 0) + 1);
        notify();
        return () => {
            const remaining = (occupied.get(index) ?? 1) - 1;
            if (remaining > 0) {
                occupied.set(index, remaining);
            } else {
                occupied.delete(index);
            }
            notify();
        };
    }, [index]);
}

/** The left-most place along the bottom right which nothing holds - one past the furthest button, or the edge itself */
export function useNextFloatingSlot() {
    return useSyncExternalStore(subscribe, () => Math.max(-1, ...occupied.keys()) + 1);
}
