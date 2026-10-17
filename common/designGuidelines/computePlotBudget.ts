import { ICard, PlotValue } from "../models/cards";

function asNumber(value: PlotValue | undefined): number {
    return typeof value === "number" ? value : 0;
}

export function computePlotBudget(plotStats: {
    income: PlotValue;
    initiative: PlotValue;
    claim: PlotValue;
    reserve: PlotValue;
}): number {
    return (
        asNumber(plotStats.income) * 2 +
        asNumber(plotStats.initiative) * 1 +
        asNumber(plotStats.claim) * 5 +
        asNumber(plotStats.reserve) * 1
    );
}

/** The "typical" plot's stat total across an existing card pool - what a new plot suggestion's own
 *  total is compared against. `undefined` only when the pool has no plots to compare against at all. */
export function computePlotPoolMedian(cards: Pick<ICard, "type" | "plotStats">[]): number | undefined {
    const budgets = cards
        .filter((card): card is Pick<ICard, "type" | "plotStats"> & { plotStats: NonNullable<ICard["plotStats"]> } =>
            Boolean(card.type === "plot" && card.plotStats)
        )
        .map((card) => computePlotBudget(card.plotStats))
        .sort((a, b) => a - b);

    if (budgets.length === 0) {
        return undefined;
    }
    const mid = Math.floor(budgets.length / 2);
    return budgets.length % 2 !== 0 ? budgets[mid] : (budgets[mid - 1] + budgets[mid]) / 2;
}
