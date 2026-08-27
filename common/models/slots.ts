import { Faction, Type } from "./cards";
import { areReleaseChecksClosed, ReleaseStatus } from "./projects";
import { StatementAnswer } from "./reviews";
import { IAuditable } from "./shared";
import { IArtworkProgress } from "./artwork";
import { isCheckStale, IRefinementCheck, IRefinementInquiry } from "./refinement";
import { SemanticVersion } from "../utils";

// The artwork lane lives in ./artwork, but is re-exported here so a slot's three lanes stay importable together
export { artworkStatuses, artworkTypes } from "./artwork";
export type { ArtworkStatus, ArtworkType } from "./artwork";
export type { IArtworkProgress };

// The refinement step's own records live in ./refinement, re-exported so a slot's design step stays
// importable as one piece. Staleness comes with them, since both kinds of check are stamped the same way
export type { IRefinementCheck, IRefinementInquiry };
export { isCheckStale };

export const designStatuses = ["preview", "forging", "refinement", "complete"] as const;
export const productionStatuses = ["waiting", "compositing", "complete"] as const;
export const releaseCheckCategories = ["balance", "fun", "complexity", "interaction", "other"] as const;

export type DesignStatus = (typeof designStatuses)[number];
export type ProductionStatus = (typeof productionStatuses)[number];
export type ReleaseCheckCategory = (typeof releaseCheckCategories)[number];

// Which phase each design status sits in. Moving between phases requires special permission/endpoints
export type DesignPhase = "development" | "finalising";
export const designPhase: Record<DesignStatus, DesignPhase> = {
    preview: "development",
    forging: "development",
    refinement: "finalising",
    complete: "finalising"
};

/** Notes are a prompt for discussion, not the discussion itself - kept short so a tally stays scannable */
export const RELEASE_CHECK_NOTE_MAX = 140;

/** One team member's sign-off on whether a card is safe to release */
export interface IReleaseCheck extends IAuditable {
    ready: boolean;
    categories?: ReleaseCheckCategory[];
    note?: string;
    /** Card version this verdict was made against - stamped server side */
    version: SemanticVersion;
    _metadata?: {
        /** The verdict mirrored into the card's forum thread; cleared when re-checked against a new version */
        discord?: {
            messageUrl?: string;
            lastSynced?: Date;
        };
    };
}

export type ChecksClosedReason = "design" | "release";

/**
 * Why a card's release checks are closed, if they are - a locked in design leaves nothing for a check to
 * influence, and an approved release says the same of everything in it. Undefined while checks are open.
 */
export function checksClosedBy(design: DesignStatus, release?: ReleaseStatus): ChecksClosedReason | undefined {
    if (designPhase[design] === "finalising") {
        return "design";
    }
    if (release && areReleaseChecksClosed(release)) {
        return "release";
    }
    return undefined;
}

/** Design at refinement+ in a pack past planning is locked to print - a draft on it won't trigger a playtesting update */
export function isReleaseBound(design: DesignStatus, release?: ReleaseStatus): boolean {
    return designPhase[design] === "finalising" && !!release && release !== "planning";
}

/** The card a slot will actually ship with - its release-bound draft if it has one, else latest */
export function resolveFinalCard<C>(
    design: DesignStatus,
    release: ReleaseStatus | undefined,
    draftCard: C | undefined,
    latestCard: C | undefined
): C | undefined {
    return draftCard && isReleaseBound(design, release) ? draftCard : latestCard;
}

/**
 * Both kinds of sign-off a card collects, grouped because they are the same sort of record - one entry
 * per person, version stamped, upserted by createdBy - taken at complementary points in the lane
 */
export interface IDesignChecks {
    /** Submitted while the card is still in development; closed once its design is locked in */
    release: IReleaseCheck[];
    /** Submitted during refinement - somebody asserting they have looked this card over */
    refinement: IRefinementCheck[];
}

export interface IDesignProgress {
    status: DesignStatus;
    checks: IDesignChecks;
    /** Points raised against this card during refinement, numbered from 1 in creation order */
    inquiries: IRefinementInquiry[];
    /** Set/cleared only by the privileged PATCH /:slot/design/status endpoint */
    finalApproval?: { by: string; at: Date };
}

/** Release-check tally for a slot, measured against everyone holding SUBMIT_RELEASE_CHECK */
export interface IReleaseCheckSummary {
    /** Latest confirmed card version the counts are measured against; absent if the slot has no card yet */
    version?: SemanticVersion;
    ready: number;
    notReady: number;
    /** Eligible submitters yet to submit a check against `version` */
    pending: number;
    /** Subset of `pending` who answered an earlier version - kept separate so a re-check can be asked for */
    stale: number;
    /** How many people could submit a check at all */
    total: number;
    /**
     * How each playtester answered "it could be released as is", for reviews of `version` only - reviews
     * of earlier versions are discounted entirely. Empty without permission to read reviews.
     */
    releasable: IReleasableAnswer[];
}

/** One playtester's verdict on whether a card could be released as is */
export interface IReleasableAnswer {
    reviewer: string;
    answer: StatementAnswer;
}

/** One card's release check state within a release - see the Discord announcement */
export interface IReleaseCheckCard {
    number: number;
    name: string;
    /** Submitters who checked the card's current version; stale ones don't count towards it */
    checkedBy: string[];
}

/** Who has taken part in a release's checks - drives the Discord announcement's live summary */
export interface IReleaseCheckParticipation {
    /** How many people hold SUBMIT_RELEASE_CHECK */
    eligible: number;
    /** How many of them have checked at least one open card against its current version */
    started: number;
    /** Submitters who have checked every open card - the announcement showcases them by name */
    completed: string[];
}

export interface SlotStatuses {
    design: IDesignProgress;
    artwork: IArtworkProgress;
    production: ProductionStatus;
}

export interface SlotRelease {
    code: string;
    /** Position within the release, 1..release.capacity. NOT the absolute printed number - see getFinalCardNumber */
    position: number;
    /** Set by publish; once true the position is immutable and no new draft can be started against it */
    released?: boolean;
}

/** Enough to name a slot without carrying it - the pair which identifies one everywhere */
export type ISlotRef = Pick<ISlot, "project" | "number">;

/**
 * GET .../slots/:slot/artwork response - the artwork lane alone, gated by READ_ARTWORKS, not READ_SLOTS.
 * `isLockedByProduction` stands in for the raw production status, which this permission shouldn't expose.
 */
export interface ISlotArtworkDetail {
    artwork: IArtworkProgress;
    isLockedByProduction: boolean;
}

/** One row of GET .../slots/artworks - the project's Artworks list, projected down to what it uses */
export interface ISlotArtwork extends Pick<ISlot, "project" | "number" | "faction" | "release">, ISlotArtworkDetail {}

/**
 * GET .../slots/:slot/refinement response, gated by READ_REFINEMENT rather than READ_SLOTS. Carries the
 * card version everything's staleness is measured against, so a reader never has to look it up separately.
 */
export interface ISlotRefinementDetail {
    designStatus: DesignStatus;
    inquiries: IRefinementInquiry[];
    /** Only the refinement kind reaches here, so nothing has to distinguish it from a release check */
    refinementChecks: IRefinementCheck[];
    /** Absent without READ_FAQ, which is a separate permission from reading the rest of this */
    faq?: string;
    /** The slot's final card - a release-bound draft where it has one, otherwise the latest */
    version?: SemanticVersion;
}

/** One row of GET .../slots/refinements - the project's Refinements list, projected down to what it uses */
export interface ISlotRefinement
    extends Pick<ISlot, "project" | "number" | "faction" | "release">,
        ISlotRefinementDetail {}

export interface ISlot extends IAuditable {
    project: number;
    /** Permanent key alongside project; matches ICard.number */
    number: number;
    /** Fixed at creation - determines which faction carousel this slot belongs to */
    faction: Faction;
    /** Recommended card type for this slot; advisory only, never enforced */
    type?: Type;
    notes?: string;
    /** Rich text. The refinement team's own record of decisions on this card - never exported anywhere */
    faq?: string;
    statuses: SlotStatuses;
    release?: SlotRelease;
}

export const DefaultSlotStatuses: SlotStatuses = {
    design: { status: "preview", checks: { release: [], refinement: [] }, inquiries: [] },
    artwork: { status: "pending" },
    production: "waiting"
};
