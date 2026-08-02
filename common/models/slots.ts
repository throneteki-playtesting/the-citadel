import { Faction, Type } from "./cards";
import { areReleaseChecksClosed, ReleaseStatus } from "./projects";
import { IAuditable } from "./shared";
import { SemanticVersion } from "../utils";

export const designStatuses = ["preview", "forging", "refinement", "complete"] as const;
export const artworkStatuses = ["pending", "acquiring", "confirming", "complete"] as const;
export const artworkTypes = ["sourced", "commissioned", "ai"] as const;
export const productionStatuses = ["waiting", "compositing", "complete"] as const;
export const releaseCheckCategories = ["balance", "fun", "complexity", "interaction", "other"] as const;

export type DesignStatus = (typeof designStatuses)[number];
export type ArtworkStatus = (typeof artworkStatuses)[number];
export type ArtworkType = (typeof artworkTypes)[number];
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

/** A verdict only counts while it matches the slot's latest confirmed card; any version change stales it */
export function isCheckStale(entry: IReleaseCheck, latest?: SemanticVersion) {
    return !!latest && entry.version !== latest;
}

export interface IDesignProgress {
    status: DesignStatus;
    /** One entry per submitter, upserted by createdBy */
    checks: IReleaseCheck[];
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

export interface IArtworkProgress {
    status: ArtworkStatus;
    /** Chosen once work actually starts; unset while pending */
    type?: ArtworkType;
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

export interface ISlot extends IAuditable {
    project: number;
    /** Permanent key alongside project; matches ICard.number */
    number: number;
    /** Fixed at creation - determines which faction carousel this slot belongs to */
    faction: Faction;
    /** Recommended card type for this slot; advisory only, never enforced */
    type?: Type;
    notes?: string;
    statuses: SlotStatuses;
    release?: SlotRelease;
}

export const DefaultSlotStatuses: SlotStatuses = {
    design: { status: "preview", checks: [] },
    artwork: { status: "pending" },
    production: "waiting"
};
