import { challengeIcons, IPlaytestCard } from "common/models/cards";
import { Explodable } from "common/types";

// traits/releaseCodes extend Explodable<IPlaytestCard> rather than fitting inside it - traits is
// an array field (needs "contains any of", not per-element filters) and releaseCodes isn't a card field at all.
export type CardFilterValue = Omit<Explodable<IPlaytestCard>, "traits"> & {
    traits?: string[];
    releaseCodes?: string[];
};

export const EMPTY_CARD_FILTER: CardFilterValue = {};

export function isCardFilterActive(value: CardFilterValue): boolean {
    return countActiveCardFilters(value) > 0;
}

export function countActiveCardFilters(value: CardFilterValue): number {
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
    if (value.releaseCodes && value.releaseCodes.length > 0) count++;
    return count;
}
