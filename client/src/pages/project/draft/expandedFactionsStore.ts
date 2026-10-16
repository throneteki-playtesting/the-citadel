import { useSyncExternalStore } from "react";
import { Faction, factions } from "common/models/cards";
import { DRAFT_EXPANDED_ALL } from "../../../constants";

// Which factions of the draft on show are expanded, outside React so a toggle redraws only its faction
let expanded: ReadonlySet<Faction> = new Set();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

function setExpanded(next: ReadonlySet<Faction>) {
    expanded = next;
    listeners.forEach((listener) => listener());
}

// Taken from the url as the board opens, before anything reads it
export function seedExpandedFactions(param: string | null) {
    const named = param?.split(",") ?? [];
    expanded = new Set(param === DRAFT_EXPANDED_ALL ? factions : factions.filter((faction) => named.includes(faction)));
}

// The url's value for the factions on show - "all" while every one is expanded, and none with nothing expanded
export function expandedParam(expanded: ReadonlySet<Faction>, shown: Faction[]) {
    if (expanded.size === 0) {
        return undefined;
    }
    if (shown.length > 0 && shown.every((faction) => expanded.has(faction))) {
        return DRAFT_EXPANDED_ALL;
    }
    return factions.filter((faction) => expanded.has(faction)).join(",");
}

export function toggleFactionExpanded(faction: Faction) {
    const next = new Set(expanded);
    if (!next.delete(faction)) {
        next.add(faction);
    }
    setExpanded(next);
}

export function setFactionsExpanded(next: Faction[]) {
    setExpanded(new Set(next));
}

export const isAnyFactionExpanded = () => expanded.size > 0;

export function useExpandedFactions() {
    return useSyncExternalStore(subscribe, () => expanded);
}

export function useIsFactionExpanded(faction: Faction) {
    return useSyncExternalStore(subscribe, () => expanded.has(faction));
}

export function useAreFactionsExpanded(shown: Faction[]) {
    return useSyncExternalStore(subscribe, () => shown.length > 0 && shown.every((faction) => expanded.has(faction)));
}
