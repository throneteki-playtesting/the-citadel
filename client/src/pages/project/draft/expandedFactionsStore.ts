import { useSyncExternalStore } from "react";
import { Faction, factions } from "common/models/cards";

// Which factions of each draft are expanded, remembered per browser, outside React so a toggle redraws only its faction
const expandedByProject = new Map<number, ReadonlySet<Faction>>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const storageKey = (project: number) => `draft.expanded.${project}`;

function read(project: number): ReadonlySet<Faction> {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(storageKey(project)) ?? "[]");
        return new Set(Array.isArray(stored) ? factions.filter((faction) => stored.includes(faction)) : []);
    } catch {
        return new Set();
    }
}

function expandedIn(project: number) {
    let expanded = expandedByProject.get(project);
    if (!expanded) {
        expanded = read(project);
        expandedByProject.set(project, expanded);
    }
    return expanded;
}

function setExpanded(project: number, expanded: ReadonlySet<Faction>) {
    expandedByProject.set(project, expanded);
    try {
        localStorage.setItem(storageKey(project), JSON.stringify([...expanded]));
    } catch {
        // Without storage it lasts for this visit alone
    }

    listeners.forEach((listener) => listener());
}

export function toggleFactionExpanded(project: number, faction: Faction) {
    const next = new Set(expandedIn(project));
    if (!next.delete(faction)) {
        next.add(faction);
    }
    setExpanded(project, next);
}

export function setFactionsExpanded(project: number, expanded: Faction[]) {
    setExpanded(project, new Set(expanded));
}

export const isAnyFactionExpanded = (project: number) => expandedIn(project).size > 0;

export function useIsFactionExpanded(project: number, faction: Faction) {
    return useSyncExternalStore(subscribe, () => expandedIn(project).has(faction));
}

export function useAreFactionsExpanded(project: number, shown: Faction[]) {
    return useSyncExternalStore(
        subscribe,
        () => shown.length > 0 && shown.every((faction) => expandedIn(project).has(faction))
    );
}
