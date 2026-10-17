import { Faction, factions, Type, types } from "common/models/cards";
import { SuggestionSegment } from "../../components/data/suggestionFilter";

// What's picked on the Suggestion Spread, as "faction|type" cells. A whole faction is every one of its
// types, whether or not each currently has suggestions, so it reads the same however the counts move.
export type SpreadSelection = ReadonlySet<string>;

export const EMPTY_SELECTION: SpreadSelection = new Set();

const cellKey = (faction: Faction, type: Type) => `${faction}|${type}`;

const cellsFor = (faction: Faction, type?: Type) =>
    type ? [cellKey(faction, type)] : types.map((t) => cellKey(faction, t));

export function isCellSelected(selection: SpreadSelection, faction: Faction, type: Type) {
    return selection.has(cellKey(faction, type));
}

export function isFactionSelected(selection: SpreadSelection, faction: Faction) {
    return cellsFor(faction).every((cell) => selection.has(cell));
}

export function isFactionPartlySelected(selection: SpreadSelection, faction: Faction) {
    return cellsFor(faction).some((cell) => selection.has(cell)) && !isFactionSelected(selection, faction);
}

// Picking every type a faction actually shows is picking the faction, so it's promoted to the whole of
// it; anything short of that drops the types it doesn't show, which could only have come from it being whole
function settleFaction(selection: Set<string>, faction: Faction, visibleTypes: readonly Type[]) {
    const everyVisible = visibleTypes.length > 0 && visibleTypes.every((type) => selection.has(cellKey(faction, type)));
    for (const type of types) {
        if (everyVisible) {
            selection.add(cellKey(faction, type));
        } else if (!visibleTypes.includes(type)) {
            selection.delete(cellKey(faction, type));
        }
    }
}

// A plain pick replaces the selection (or clears it, when it's exactly what's already picked); an
// additive one (Ctrl/Cmd) toggles just those cells in or out of it
export function toggleSelection(
    selection: SpreadSelection,
    faction: Faction,
    type: Type | undefined,
    additive: boolean,
    visibleTypes: readonly Type[]
): SpreadSelection {
    const cells = cellsFor(faction, type);
    if (!additive) {
        const picked = new Set(cells);
        settleFaction(picked, faction, visibleTypes);
        const isAlreadyPicked = picked.size === selection.size && [...picked].every((cell) => selection.has(cell));
        return isAlreadyPicked ? EMPTY_SELECTION : picked;
    }
    const allSelected = cells.every((cell) => selection.has(cell));
    const next = new Set(selection);
    for (const cell of cells) {
        if (allSelected) {
            next.delete(cell);
        } else {
            next.add(cell);
        }
    }
    settleFaction(next, faction, visibleTypes);
    return next;
}

export function matchesSelection(selection: SpreadSelection, card: { faction: Faction; type: Type }) {
    return selection.size === 0 || selection.has(cellKey(card.faction, card.type));
}

// The fewest pairs that say the same thing - a whole faction collapses to one faction-only segment
export function selectionSegments(selection: SpreadSelection): SuggestionSegment[] {
    return factions.flatMap((faction) =>
        isFactionSelected(selection, faction)
            ? [{ faction }]
            : types.filter((type) => selection.has(cellKey(faction, type))).map((type) => ({ faction, type }))
    );
}

export function selectionFromSegments(segments: SuggestionSegment[]): SpreadSelection {
    return segments.length === 0
        ? EMPTY_SELECTION
        : new Set(segments.flatMap((segment) => cellsFor(segment.faction, segment.type)));
}
