import { Faction, factions, Type, types } from "common/models/cards";

export type CountGrid = Record<Faction, Record<Type, number>>;

// Neutral is deliberately a larger pool than any one faction, so it sits outside the baseline it would
// otherwise inflate, and is held to that baseline scaled by the neutralWeight setting instead.
const IN_FACTION = factions.filter((faction) => faction !== "neutral");

export function emptyGrid(): CountGrid {
    return Object.fromEntries(
        factions.map((faction) => [faction, Object.fromEntries(types.map((type) => [type, 0]))])
    ) as CountGrid;
}

// Agendas are excluded - they're overwhelmingly neutral, so a faction baseline for them means nothing
export function averageByType(grid: CountGrid) {
    const map = new Map<Type, number>();
    for (const type of types) {
        if (type !== "agenda") {
            map.set(type, IN_FACTION.reduce((total, faction) => total + grid[faction][type], 0) / IN_FACTION.length);
        }
    }
    return map;
}

// Whole suggestions only - what's shown as expected is exactly what the count is compared against
export function expectedCount(averages: Map<Type, number>, faction: Faction, type: Type, neutralWeight: number) {
    const average = averages.get(type) ?? 0;
    return Math.round(faction === "neutral" ? average * neutralWeight : average);
}
