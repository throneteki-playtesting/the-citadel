import { createContext, useContext, useSyncExternalStore } from "react";
import { Faction, ICardSuggestion, IPlaytestCard, Type } from "common/models/cards";
import { SemanticVersion } from "common/utils";

/** How a card let go of ends: true, another copy took over; "taken in", the pool took it; false, nothing came of it */
export type DropResult = boolean | "taken in";

// Where a card taken from the pool is held from, which is no slot
export const POOLED_FROM = -1;

/** A card in hand and the slot it is held from - or, taken from the pool, the suggestion it is the card of */
export type DragData = { card: IPlaytestCard; slotNumber: number; suggestion?: ICardSuggestion };

type DragState = {
    active?: DragData;
    /** The slot under the card in hand */
    over?: number;
    /** Set when `over` was chosen for a faction the card is held over, rather than being the slot itself */
    overFaction?: Faction;
    /** The suggestion the card in hand was made from no longer exists, so it can't go back in the pool */
    isOrphaned?: boolean;
    /** A touch pick-up not yet moved - released still, it arranges the pile instead */
    held?: number;
};

// Outside React state, so a drag only redraws what reads the part of it that changed - not the page around it
export function createDragStore() {
    let state: DragState = {};
    const listeners = new Set<() => void>();
    // A card let go of is held where it was dropped until the page has dealt with it, and the one dealing with it says how
    // it ends (see DropResult)
    let drop:
        | {
              rect?: DOMRect;
              isReturning: boolean;
              promise: Promise<DropResult>;
              settle: (result: DropResult) => void;
              started: Promise<void>;
              start: () => void;
          }
        | undefined;
    return {
        get: () => state,
        // isReturning: the card is on its way back to where it came from, rather than being placed somewhere new
        beginDrop(isReturning = false) {
            let settle!: (result: DropResult) => void;
            let start!: () => void;
            drop = {
                isReturning,
                promise: new Promise<DropResult>((resolve) => (settle = resolve)),
                settle,
                started: new Promise<void>((resolve) => (start = resolve)),
                start
            };
        },
        isReturning: () => !!drop?.isReturning,
        // The overlay has taken the card from here, and begun - its place in the pile may now go
        takeReturning() {
            if (drop) {
                drop.isReturning = false;
                drop.start();
            }
        },
        // Resolves once the overlay has begun - the animation needs the card's place in the pile to start from
        dropStarted: () => drop?.started,
        // What the held card waits on
        dropOutcome: () => drop?.promise,
        setDropRect(rect: DOMRect) {
            if (drop) {
                drop.rect = rect;
            }
        },
        dropRect: () => drop?.rect,
        // Kept, settled, until the overlay has read it - which may be after this, when the answer was already known
        endDrop(result: DropResult) {
            drop?.settle(result);
        },
        clearDrop() {
            drop = undefined;
        },
        set(patch: DragState) {
            const next = { ...state, ...patch };
            if (
                next.active === state.active &&
                next.over === state.over &&
                next.overFaction === state.overFaction &&
                next.isOrphaned === state.isOrphaned &&
                next.held === state.held
            ) {
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
    const incomingType = useDragState((state): Type | undefined =>
        pendingMove(state)?.to === number ? state.active?.card.type : undefined
    );
    return { isHeld, isReceiving, leavingVersion, incomingType };
}
