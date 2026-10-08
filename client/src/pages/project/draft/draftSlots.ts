import { Faction, factions, IPlaytestCard, Type } from "common/models/cards";
import { asksForPlotsOnly, fitsSlot, SlotCondition, slotConditionIssues } from "common/models/slotConditions";
import { ISlot, orderByPreference, preferenceLabel } from "common/models/slots";
import { renderPlaytestingCard, SemanticVersion } from "common/utils";
import { resourceIdFuncs } from "common/resources";
import { CARRIED_FOR_MS } from "../../../constants";
import type { CardControl } from "./flyingCard";
import type { IncomingCard } from "./incomingCards";

export type DraftSlot = {
    faction: Faction;
    number: number;
    slot: ISlot;
    /** In order of preference, the Favoured first */
    options: IPlaytestCard[];
};

export type FactionSlots = Map<Faction, DraftSlot[]>;

export function buildFactionSlots(cards: IPlaytestCard[] = [], slots: ISlot[] = []): FactionSlots {
    const map: FactionSlots = new Map();
    for (const faction of factions) {
        map.set(
            faction,
            slots
                .filter((slot) => slot.faction === faction)
                .sort((a, b) => a.number - b.number)
                .map((slot) => ({
                    faction,
                    number: slot.number,
                    slot,
                    options: orderByPreference(
                        cards.filter((card) => card.number === slot.number),
                        slot.preferences
                    )
                }))
        );
    }
    return map;
}

// Where a card dropped on its faction goes: the first open slot it fits, other than the one it is already in
export const firstFittingSlot = (slots: DraftSlot[] | undefined, card: IPlaytestCard, excluding?: number) =>
    slots?.find((slot) => slot.number !== excluding && !slot.slot.closed && fitsSlot(slot.slot, card));

const isSameDraftSlot = (a: DraftSlot, b: DraftSlot) =>
    a.slot === b.slot && a.options.length === b.options.length && a.options.every((card, i) => card === b.options[i]);

// Keeps each slot's previous object while nothing in it changed, so a memoised slot only redraws for its own changes
export function reuseUnchanged(previous: FactionSlots, next: FactionSlots): FactionSlots {
    const previousByNumber = new Map([...previous.values()].flat().map((slot) => [slot.number, slot]));
    const result: FactionSlots = new Map();
    for (const [faction, slots] of next) {
        const reused = slots.map((slot) => {
            const old = previousByNumber.get(slot.number);
            return old && isSameDraftSlot(old, slot) ? old : slot;
        });
        const oldSlots = previous.get(faction);
        const isSame = oldSlots?.length === reused.length && reused.every((slot, i) => slot === oldSlots[i]);
        result.set(faction, isSame && oldSlots ? oldSlots : reused);
    }
    return result;
}

// A slot lies on its side when everything in it is a plot - and while it is empty, when it asks for plots alone.
// `incoming` is a card about to join it, so a slot can show what it is about to become
export function isLandscapeSlot(conditions: SlotCondition[] | undefined, options: IPlaytestCard[], incoming?: Type) {
    const types = [...options.map((card) => card.type), ...(incoming ? [incoming] : [])];
    return types.length > 0 ? types.every((type) => type === "plot") : asksForPlotsOnly(conditions);
}

export function findDraftSlot(factionSlots: FactionSlots, number: number) {
    return [...factionSlots.values()].flat().find((slot) => slot.number === number);
}

// The rank a card would hold once the drag in hand lands - one down for an arrival, one up behind a departure
export function projectedRank(
    options: IPlaytestCard[],
    card: IPlaytestCard,
    isReceiving: boolean,
    leavingVersion?: SemanticVersion
) {
    const rank = options.indexOf(card);
    if (isReceiving) {
        return rank + 1;
    }
    const leavingRank = options.findIndex((option) => option.version === leavingVersion);
    return leavingVersion !== undefined && card.version !== leavingVersion && rank > leavingRank ? rank - 1 : rank;
}

// A card leaving takes the view to the card beneath it; an addition or a reorder goes back to the Favoured
export function nextSelection(previous: string[], next: string[], selected: number) {
    const isRemovalOnly =
        next.length < previous.length && previous.filter((version) => next.includes(version)).join() === next.join();
    if (isRemovalOnly) {
        for (let step = 0; step < previous.length; step++) {
            const index = next.indexOf(previous[(selected - step + previous.length) % previous.length]);
            if (index !== -1) {
                return index;
            }
        }
    }
    return Math.max(0, next.length - 1);
}

// Beside other card types a plot is turned upright, to fit the same portrait frame
export const isUprightPlot = (card: IPlaytestCard, hasNonPlot: boolean) => card.type === "plot" && hasNonPlot;

// A card just added to a slot, on its way from where it was drawn to the top of the slot's pile
export function incomingCardFor(
    card: IPlaytestCard,
    slot: DraftSlot,
    from: DOMRect,
    fromControl: CardControl
): IncomingCard {
    return {
        card,
        rank: 0,
        from,
        isFromUpright: false,
        isUpright: isUprightPlot(card, card.type !== "plot" || slot.options.some((option) => option.type !== "plot")),
        issues: slotConditionIssues(slot.slot.conditions, card, true),
        fromControl
    };
}

export function renderDraftCard(card: IPlaytestCard, rank: number, slotNumber: number) {
    return renderPlaytestingCard(card, {
        top: preferenceLabel(rank),
        middle: `Card #${slotNumber}`,
        bottom: card.suggestionId ? "From Suggestion" : "New Design"
    });
}

// Drag ids outlive the key change a move makes, so the drop animation can find the card where it landed
const dragUids = new Map<string, string>();
export function getDragUid(card: IPlaytestCard) {
    const key = resourceIdFuncs.card(card);
    let uid = dragUids.get(key);
    if (!uid) {
        uid = crypto.randomUUID();
        dragUids.set(key, uid);
    }
    return uid;
}

// Cards mid-move, keyed at both ends - neither pile sets them down nor tosses them, as the drag already carries them
const carriedCards = new Set<string>();
export const isCarried = (card: IPlaytestCard) => carriedCards.has(resourceIdFuncs.card(card));

// Cards flown in by hand are carried until they land, so the pile lets them straight in rather than setting them down
export function carryArrivals(cards: IPlaytestCard[]) {
    cards.forEach((card) => carriedCards.add(resourceIdFuncs.card(card)));
}

export function releaseArrivals(cards: IPlaytestCard[]) {
    cards.forEach((card) => carriedCards.delete(resourceIdFuncs.card(card)));
}

// A card taken out of its pile by hand, which the pile has nothing to do with - the hand has it
export function carryAway(card: IPlaytestCard) {
    const key = resourceIdFuncs.card(card);
    carriedCards.add(key);
    setTimeout(() => carriedCards.delete(key), CARRIED_FOR_MS);
}

export function carryCard(card: IPlaytestCard, to: { number: number; version: SemanticVersion }) {
    const sourceKey = resourceIdFuncs.card(card);
    const targetKey = resourceIdFuncs.card({ project: card.project, ...to });
    dragUids.set(targetKey, getDragUid(card));
    dragUids.delete(sourceKey);
    carriedCards.add(sourceKey).add(targetKey);
    setTimeout(() => {
        carriedCards.delete(sourceKey);
        carriedCards.delete(targetKey);
    }, CARRIED_FOR_MS);
}
