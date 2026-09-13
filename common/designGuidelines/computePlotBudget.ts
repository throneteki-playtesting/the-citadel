export function computePlotBudget(plotStats: {
    income: number;
    initiative: number;
    claim: number;
    reserve: number;
}): number {
    return plotStats.income * 2 + plotStats.initiative * 1 + plotStats.claim * 5 + plotStats.reserve * 1;
}
