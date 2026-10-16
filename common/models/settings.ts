import { IAuditable } from "./shared";

// Grows as more settings-backed areas are added - each is its own document, keyed by this type
export type SettingsType = "suggestions";

/** One selectable reward/downside/etc option. Generic (not suggestions-specific) even though it's
 *  currently only used there, so a future settings type can reuse the same shape. */
export interface IRewardDownsideOption {
    id: string;
    label: string;
    description: string;
    /** What part of the game this touches - a search tag, and a user-visible label on the option itself */
    aspects: string[];
    /** The deck it suits - a search tag, and a user-visible label on the option itself */
    archetypes: string[];
    /** Card keywords (see `keywordNames`) which add this option to a suggestion when they appear in its text */
    keywords: string[];
    /** Rewards only - a card granting this is expected to be marked Loyal (the loyaltyConsistency rule) */
    requiresLoyalty?: boolean;
    /** Disabled hides an option from new selections, but it stays valid/rendered wherever already selected */
    enabled: boolean;
}

export interface ISuggestionsSettings {
    minimumLikesThreshold: number;
    rewardOptions: IRewardDownsideOption[];
    downsideOptions: IRewardDownsideOption[];
    /** How many times a single faction's share the neutral pool is expected to hold, per card type */
    neutralWeight: number;
    /** Which span the Suggestion Statistics chart opens on - anyone can still switch it on the page */
    defaultTrendRange: TrendRange;
}

// Stands in for documents saved before neutralWeight existed, until their next settings save writes it
export const DEFAULT_NEUTRAL_WEIGHT = 2;

export const trendRanges = ["week", "month", "year", "all"] as const;
export type TrendRange = (typeof trendRanges)[number];

// Stands in for documents saved before defaultTrendRange existed, the same way DEFAULT_NEUTRAL_WEIGHT does
export const DEFAULT_TREND_RANGE: TrendRange = "week";

export interface ISettingsMap {
    suggestions: ISuggestionsSettings;
}

export interface ISettingsDocument<T extends SettingsType = SettingsType> extends IAuditable {
    id: string;
    type: T;
    data: ISettingsMap[T];
}
