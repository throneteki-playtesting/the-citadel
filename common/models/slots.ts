import { Faction, Type } from "./cards";
import { IAuditable } from "./shared";

export const developmentStatuses = ["designing", "testing", "ready"] as const;
// NOTE: Placeholder-level tracking only. Wording will gain a full discussion/approval trail,
// and artwork will gain multi-piece tracking, in a future update.
export const wordingStatuses = ["pending", "reviewing", "approved"] as const;
export const artworkStatuses = ["pending", "commissioned", "received", "approved"] as const;
export const productionStatuses = ["pending", "filed"] as const;

export type DevelopmentStatus = (typeof developmentStatuses)[number];
export type WordingStatus = (typeof wordingStatuses)[number];
export type ArtworkStatus = (typeof artworkStatuses)[number];
export type ProductionStatus = (typeof productionStatuses)[number];

export interface SlotStatuses {
    development: DevelopmentStatus;
    wording: WordingStatus;
    artwork: ArtworkStatus;
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
    development: "designing",
    wording: "pending",
    artwork: "pending",
    production: "pending"
};
