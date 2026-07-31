import { SemanticVersion } from "common/utils";
import type { Faction } from "./cards";
import { IAuditable, ReleaseDate } from "./shared";

export const types = ["cycle", "expansion"] as const;
export const githubStatuses = ["open", "closed"] as const;
export const releaseStatuses = ["planning", "confirming", "approved", "assembling", "proofing", "released"] as const;
export const articleStatuses = ["pending", "drafted", "published"] as const;
export type Type = (typeof types)[number];
export type Code = `${number}`;
export type ReleaseStatus = (typeof releaseStatuses)[number];

export interface IProject extends IAuditable {
    number: number;
    name: string;
    code: string;
    active: boolean;
    draft: boolean;
    description?: string;
    type: Type;
    script?: string; // TODO: Remove legacy script
    /** Server-maintained cache of slot counts per faction - not directly user-editable */
    cardCount: FactionCardCount;
    version: number;
    milestone?: number;
    mandateUrl?: string;
    formUrl?: string;
    emoji?: string;
    releases: IProjectRelease[];
}

export interface IProjectRelease extends IAuditable {
    code: string;
    name: string;
    /** Pack sequence within the project (1, 2, 3...); always 1 for expansions */
    number: number;
    /** Target pack size - derived from slots; drives placeholder count and printed-number derivation */
    capacity: number;
    /** Ordered faction allocations - positions 1..capacity are partitioned by faction in this order */
    slots: ReleaseSlotAllocation[];
    plannedDate?: ReleaseDate;
    /** Set by publish; once set, the whole release is immutable */
    releasedDate?: ReleaseDate;
    status: ReleaseStatus;
    article?: {
        url?: string;
        status: (typeof articleStatuses)[number];
    };
    _metadata?: {
        /** Release check announcement; messageUrl's presence means it has already been announced */
        discord?: {
            messageUrl?: string;
            lastSynced?: Date;
        };
    };
}

/** Computed completeness for a whole project. Never stored */
export interface IProjectProgress {
    /** Mean overall% of every card in the project; absent when it has no cards to average */
    overall?: number;
    cardCount: number;
}

/** Computed completeness for one release. Never stored */
export interface IReleaseProgress {
    code: string;
    /** Mean overall% of the cards assigned to this release */
    cards: number;
    /** How far the release's own status has progressed */
    status: number;
    overall: number;
    cardCount: number;
}

export type ReleaseSlotAllocation = {
    faction: Faction;
    count: number;
};

export type FactionCardCount = {
    baratheon: number;
    greyjoy: number;
    lannister: number;
    martell: number;
    thenightswatch: number;
    stark: number;
    targaryen: number;
    tyrell: number;
    neutral: number;
};

export interface GithubPRMeta {
    status?: (typeof githubStatuses)[number];
    mergedAt?: Date;
    pullRequestUrl?: string;
    lastSynced?: Date;
}

export interface IPlaytestingUpdate extends IAuditable {
    project: number;
    version: number;
    description?: string;
    cardChanges: Record<number, SemanticVersion>;
    _metadata?: {
        github?: {
            code?: GithubPRMeta;
            data?: GithubPRMeta;
        };
    };
}
