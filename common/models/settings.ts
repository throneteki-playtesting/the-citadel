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
}

export interface ISettingsMap {
    suggestions: ISuggestionsSettings;
}

export interface ISettingsDocument<T extends SettingsType = SettingsType> extends IAuditable {
    id: string;
    type: T;
    data: ISettingsMap[T];
}
