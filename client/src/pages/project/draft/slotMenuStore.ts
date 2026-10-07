import { useSyncExternalStore } from "react";

// Which blank slot has its add menu open - at most one, and each slot only hears about its own opening or closing
let openSlot: number | undefined;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export function setSlotMenuOpen(slotNumber: number, isOpen: boolean) {
    const next = isOpen ? slotNumber : openSlot === slotNumber ? undefined : openSlot;
    if (next === openSlot) {
        return;
    }
    openSlot = next;
    listeners.forEach((listener) => listener());
}

export function closeSlotMenus() {
    if (openSlot !== undefined) {
        openSlot = undefined;
        listeners.forEach((listener) => listener());
    }
}

export function useIsSlotMenuOpen(slotNumber: number) {
    return useSyncExternalStore(subscribe, () => openSlot === slotNumber);
}
