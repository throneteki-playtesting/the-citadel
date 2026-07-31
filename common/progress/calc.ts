import { sumBy, mean } from "lodash-es";
import { ReleaseStatus, releaseStatuses } from "../models/projects";
import {
    SlotStatuses,
    designStatuses,
    artworkStatuses,
    productionStatuses,
    DesignStatus,
    ArtworkStatus,
    ProductionStatus
} from "../models/slots";
import {
    cardWeights,
    designStageWeights,
    artworkStageWeights,
    productionStageWeights,
    releaseWeights,
    releaseStageWeights
} from "./weights";

// Status arrays are in progression order, so this is the weight of every stage up to and including
// the current one, over the weight of them all - each weight being what reaching that stage is worth
function stagePct<S extends string>(current: S, ordered: readonly S[], weights: Record<S, number>): number {
    const total = sumBy(ordered, (s) => weights[s]);
    if (total === 0) {
        return 0;
    }
    const index = ordered.indexOf(current);
    return (sumBy(ordered.slice(0, index + 1), (s) => weights[s]) / total) * 100;
}

// Weighted average across parallel lanes, divided by the summed weights so adding a lane rescales
function normalizedBlend(items: { pct: number; weight: number }[]): number {
    const totalWeight = sumBy(items, "weight");
    return totalWeight === 0 ? 0 : sumBy(items, (i) => i.pct * i.weight) / totalWeight;
}

export type CardLaneBreakdown = { design: number; artwork: number; production: number; overall: number };

/** GET /projects/:project/slots/:slot/progress - the lane percentages plus the statuses behind them */
export type ICardProgress = CardLaneBreakdown & {
    statuses: { design: DesignStatus; artwork: ArtworkStatus; production: ProductionStatus };
};

export function cardLaneBreakdown(statuses: SlotStatuses): CardLaneBreakdown {
    const design = stagePct(statuses.design.status, designStatuses, designStageWeights);
    const artwork = stagePct(statuses.artwork.status, artworkStatuses, artworkStageWeights);
    const production = stagePct(statuses.production, productionStatuses, productionStageWeights);
    const overall = normalizedBlend([
        { pct: design, weight: cardWeights.design },
        { pct: artwork, weight: cardWeights.artwork },
        { pct: production, weight: cardWeights.production }
    ]);
    return { design, artwork, production, overall };
}

export function cardOverallPct(statuses: SlotStatuses): number {
    return cardLaneBreakdown(statuses).overall;
}

export function releaseProgressBreakdown(
    cardsPct: number,
    status: ReleaseStatus
): { cards: number; status: number; overall: number } {
    const statusPct = stagePct(status, releaseStatuses, releaseStageWeights);
    return {
        cards: cardsPct,
        status: statusPct,
        overall: normalizedBlend([
            { pct: cardsPct, weight: releaseWeights.cards },
            { pct: statusPct, weight: releaseWeights.status }
        ])
    };
}

// Mean of every card's overall%, not of release overalls - an unassigned card still counts
export function projectOverallPct(cardPcts: number[]): number | undefined {
    return cardPcts.length === 0 ? undefined : mean(cardPcts);
}
