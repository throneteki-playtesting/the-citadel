import { ArtworkStatus, DesignStatus, ProductionStatus } from "../models/slots";
import { ReleaseStatus } from "../models/projects";

// Defines the weights of each status within a certain context, to help with overall calculations
// A stage weight is what reaching that status is worth, not its percentage - the percentage is the
// running total up to and including that status, over the sum of all of them. So a first status of 0
// is always 0% and the last is always 100%, and a set summing to 100 reads directly as percentages
// (eg. 0, 10, 60, 30 gives 0%, 10%, 70%, 100%)
//
// Lane weights (cardWeights, releaseWeights) instead determine how much influence that lanes total
// percent has on the overall percent

export const cardWeights = {
    design: 5,
    artwork: 4,
    production: 1
} as const;

export const designStageWeights: Record<DesignStatus, number> = {
    preview: 0,
    forging: 1,
    refinement: 7,
    complete: 2
};
export const artworkStageWeights: Record<ArtworkStatus, number> = {
    pending: 0,
    acquiring: 1,
    confirming: 4,
    complete: 2
};
export const productionStageWeights: Record<ProductionStatus, number> = {
    waiting: 0,
    compositing: 1,
    complete: 2
};

export const releaseWeights = {
    cards: 3,
    status: 1
} as const;
export const releaseStageWeights: Record<ReleaseStatus, number> = {
    planning: 0,
    confirming: 4,
    approved: 6,
    released: 2
};
