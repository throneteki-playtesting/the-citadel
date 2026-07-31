import { ArtworkStatus, DesignStatus, ProductionStatus } from "../models/slots";
import { ReleaseStatus } from "../models/projects";

// Defines the weights of each status within a certain context, to help with overall calculations
// Weight is defined by the gap between statuses

export const cardWeights = { design: 3, artwork: 2, production: 1 } as const;

export const designStageWeights: Record<DesignStatus, number> = { preview: 0, forging: 1, refinement: 2, complete: 3 };
export const artworkStageWeights: Record<ArtworkStatus, number> = {
    pending: 0,
    acquiring: 1,
    confirming: 2,
    complete: 3
};
export const productionStageWeights: Record<ProductionStatus, number> = { waiting: 0, compositing: 1, complete: 2 };

export const releaseWeights = { cards: 2, status: 1 } as const;
export const releaseStageWeights: Record<ReleaseStatus, number> = {
    planning: 0,
    confirming: 1,
    approved: 2,
    assembling: 3,
    proofing: 4,
    released: 5
};
