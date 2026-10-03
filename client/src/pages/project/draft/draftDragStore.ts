import { createContext, useContext, useSyncExternalStore } from "react";
import { IPlaytestCard } from "common/models/cards";
import { SemanticVersion } from "common/utils";

export type DragData = { card: IPlaytestCard; slotNumber: number };

type DragState = {
    active?: DragData;
    /** The slot under the card in hand */
    over?: number;
    /** A touch pick-up not yet moved - released still, it arranges the pile instead */
    held?: number;
};

// Outside React state, so a drag only redraws what reads the part of it that changed - not the page around it
export function createDragStore() {
    let state: DragState = {};
    const listeners = new Set<() => void>();
    return {
        get: () => state,
        set(patch: DragState) {
            const next = { ...state, ...patch };
            if (next.active === state.active && next.over === state.over && next.held === state.held) {
                return;
            }
            state = next;
            listeners.forEach((listener) => listener());
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        }
    };
}

export type DragStore = ReturnType<typeof createDragStore>;

export const DragStoreContext = createContext<DragStore | undefined>(undefined);

/** Redraws only when what `select` returns changes, so it should return a primitive or a stable reference */
export function useDragState<T>(select: (state: DragState) => T) {
    const store = useContext(DragStoreContext);
    if (!store) {
        throw new Error("useDragState must be used within a DragStoreContext");
    }
    return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

// A card held over a slot other than its own, which both piles show the outcome of before it lands
function pendingMove({ active, over, held }: DragState) {
    return active && held === undefined && over !== undefined && over !== active.slotNumber
        ? { from: active.slotNumber, to: over, version: active.card.version }
        : undefined;
}

/** What a drag in hand means for one slot, each part a primitive so the slot redraws only when its own changes */
export function useSlotDrag(number: number) {
    const isHeld = useDragState((state) => state.held === number);
    const isReceiving = useDragState((state) => pendingMove(state)?.to === number);
    const leavingVersion = useDragState((state): SemanticVersion | undefined => {
        const move = pendingMove(state);
        return move?.from === number ? move.version : undefined;
    });
    return { isHeld, isReceiving, leavingVersion };
}
