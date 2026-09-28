import { IAuditable } from "./shared";

// Grows as more settings-backed areas are added - each is its own document, keyed by this type
export type SettingsType = "suggestions";

/** One selectable reward/punishment/etc option. Generic (not suggestions-specific) even though it's
 *  currently only used there, so a future settings type can reuse the same shape. */
export interface IRewardPunishmentOption {
    id: string;
    label: string;
    description: string;
    /** Short, illustrative example strings - not gameplay-verified rules text */
    examples: string[];
    /** Both a search target and a user-visible label on the option itself */
    tags: string[];
    /** Disabled hides an option from new selections, but it stays valid/rendered wherever already selected */
    enabled: boolean;
}

export interface ISuggestionsSettings {
    minimumLikesThreshold: number;
    rewardTypes: IRewardPunishmentOption[];
    punishmentTypes: IRewardPunishmentOption[];
    /** Tags which, when present on a selected reward, trigger the loyalty-consistency checklist rule */
    loyaltyTags: string[];
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
