import { AbilityType, challengeIcons, ICard, ReactionType } from "common/models/cards";
import { Explodable } from "common/types";
import { RewardType } from "common/designGuidelines/rewardTypes";
import { PunishmentType } from "common/designGuidelines/punishmentTypes";

// Mirrors CardFilterValue - every ICard field it exposes carries over unchanged, minus `releases`
// (no release concept for a suggestion), plus suggestion-specific fields layered on top.
export type SuggestionFilterValue = Omit<Explodable<ICard>, "traits"> & {
    traits?: string[];
    // Mutually exclusive with each other (enforced by the drawer, not by this type) - selecting one
    // clears the other, since both are "which suggestions" angles on the same underlying set.
    mine?: boolean;
    unseen?: boolean;
    // Specific submitters' discordIds (the drawer's Submitted By multiselect) - its own field rather
    // than reusing `mine`, since that's always "the signed-in viewer" and this can be anyone.
    byUsers?: string[];
    approvedFilter?: "awaiting" | "only" | "none";
    // Which of the viewer's own reactions to filter to, not mutually exclusive - unset/empty still
    // excludes ignored-by-me by default, so this is the one field whose ABSENCE isn't a no-op.
    myReactions?: ReactionType[];
    rewardTypes?: RewardType[];
    punishment?: PunishmentType[];
    abilityTypes?: AbilityType[];
    iconic?: boolean;
};

export const EMPTY_SUGGESTION_FILTER: SuggestionFilterValue = {};

export function isSuggestionFilterActive(value: SuggestionFilterValue): boolean {
    return countActiveSuggestionFilters(value) > 0;
}

export function countActiveSuggestionFilters(value: SuggestionFilterValue): number {
    let count = 0;
    if (value.type && (!Array.isArray(value.type) || value.type.length > 0)) count++;
    if (value.faction && (!Array.isArray(value.faction) || value.faction.length > 0)) count++;
    if (value.loyal !== undefined) count++;
    if (value.unique !== undefined) count++;
    if (value.icons && challengeIcons.some((icon) => value.icons?.[icon] !== undefined)) count++;
    if (value.cost !== undefined) count++;
    if (value.strength !== undefined) count++;
    if (value.plotStats?.income !== undefined) count++;
    if (value.plotStats?.initiative !== undefined) count++;
    if (value.plotStats?.claim !== undefined) count++;
    if (value.plotStats?.reserve !== undefined) count++;
    if (value.name !== undefined) count++;
    if (value.text !== undefined) count++;
    if (value.flavor !== undefined) count++;
    if (value.designer !== undefined) count++;
    if (value.traits && value.traits.length > 0) count++;
    if (value.mine) count++;
    if (value.unseen) count++;
    if (value.byUsers && value.byUsers.length > 0) count++;
    if (value.approvedFilter !== undefined) count++;
    if (value.myReactions && value.myReactions.length > 0) count++;
    if (value.rewardTypes && value.rewardTypes.length > 0) count++;
    if (value.punishment && value.punishment.length > 0) count++;
    if (value.abilityTypes && value.abilityTypes.length > 0) count++;
    if (value.iconic !== undefined) count++;
    return count;
}
