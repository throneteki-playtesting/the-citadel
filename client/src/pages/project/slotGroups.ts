import { isEqual, pick } from "lodash-es";
import Joi from "joi";
import { Faction, factions, IPlaytestCard } from "common/models/cards";
import { SlotCounts, TemplateSlots } from "common/models/projects";
import { conditionsBlocker, withoutBlockedConditions } from "common/models/slotConditions";
import { ISlot, ISlotOptions, slotOptionKeys } from "common/models/slots";
import { Slot } from "common/models/schemas";
import { isDirty, pruneEmpty } from "common/utils";
import { schemaErrors } from "../../hooks/useFormValidation";

/** What a faction's slots look like - how many, and what each asks for, in order */
export type FactionScheme = { count: number; options: ISlotOptions[] };

/** Factions sharing one scheme, so setting it once sets it for all of them */
export type SlotGroup = FactionScheme & { id: number; factions: Faction[] };

export type SlotOptionErrors = Record<string, Record<string, string>>;

const NO_OPTIONS: ISlotOptions = {};
const EMPTY_SCHEME: FactionScheme = { count: 0, options: [] };
const houses = factions.filter((faction) => faction !== "neutral");

export const optionsAt = (scheme: FactionScheme, position: number) => scheme.options[position] ?? NO_OPTIONS;
export const errorKey = (group: SlotGroup, position: number) => `${group.id}:${position}`;
export const hasGroupErrors = (errors: SlotOptionErrors, group: SlotGroup) =>
    Array.from({ length: group.count }, (_, position) => errorKey(group, position)).some((key) => key in errors);

const byNumber = (a: ISlot, b: ISlot) => a.number - b.number;
export const slotsOf = (slots: ISlot[], faction: Faction) =>
    slots.filter((slot) => slot.faction === faction).sort(byNumber);

export function savedSchemes(slots: ISlot[]) {
    return Object.fromEntries(
        factions.map((faction) => {
            const own = slotsOf(slots, faction);
            return [faction, { count: own.length, options: own.map((slot) => pick(slot, slotOptionKeys)) }];
        })
    ) as Record<Faction, FactionScheme>;
}

const comparable = ({ count, options }: FactionScheme) => ({
    count,
    options: Array.from({ length: count }, (_, position) => pruneEmpty(options[position] ?? NO_OPTIONS))
});

// Factions whose slots already match are gathered into one group, in the order factions are listed
export function groupSchemes(schemes: Record<Faction, FactionScheme>): SlotGroup[] {
    const groups: SlotGroup[] = [];
    for (const faction of factions) {
        const scheme = schemes[faction];
        const match = groups.find((group) => isEqual(comparable(group), comparable(scheme)));
        if (match) {
            match.factions.push(faction);
        } else {
            groups.push({ id: groups.length + 1, factions: [faction], ...scheme });
        }
    }
    return groups;
}

export function templateSchemes(slots: TemplateSlots) {
    return Object.fromEntries(
        factions.map((faction) => [faction, { count: slots[faction].length, options: slots[faction] }])
    ) as Record<Faction, FactionScheme>;
}

// A project with no slots of its own yet starts as the houses together and Neutral apart
export function startingGroups(): SlotGroup[] {
    return [
        { id: 1, factions: houses, ...EMPTY_SCHEME },
        { id: 2, factions: ["neutral"], ...EMPTY_SCHEME }
    ];
}

/** The id the next group split off will take */
export const nextGroupId = (groups: SlotGroup[]) => Math.max(0, ...groups.map((group) => group.id)) + 1;

// Groups sit in faction order, each placed by the first faction it holds
const leadOf = (group: SlotGroup) => factions.indexOf(group.factions[0]);
const inFactionOrder = (groups: SlotGroup[]) => [...groups].sort((a, b) => leadOf(a) - leadOf(b));

// A neutral slot can't ask for loyalty, so a group it joins loses any condition it couldn't hold
const fitFor = (group: SlotGroup): SlotGroup =>
    group.factions.includes("neutral")
        ? {
              ...group,
              options: group.options.map((options) => ({
                  ...options,
                  conditions: options.conditions && withoutBlockedConditions(options.conditions, "neutral")
              }))
          }
        : group;

// Where a group of the faction alone would sit, were it split off from the groups as they stand
export function newGroupIndex(groups: SlotGroup[], faction: Faction) {
    const index = groups.findIndex((group) => {
        const lead = group.factions.find((member) => member !== faction);
        return !!lead && factions.indexOf(lead) > factions.indexOf(faction);
    });
    return index < 0 ? groups.length : index;
}

// The faction takes on the target group's slots in place of its own
export function moveFaction(groups: SlotGroup[], faction: Faction, targetId: number): SlotGroup[] {
    const moved = groups
        .map((group) => {
            const others = group.factions.filter((member) => member !== faction);
            return group.id === targetId
                ? fitFor({ ...group, factions: factions.filter((f) => f === faction || others.includes(f)) })
                : { ...group, factions: others };
        })
        .filter((group) => group.factions.length > 0);
    return inFactionOrder(moved);
}

// The faction leaves with a copy of the slots it had, to be changed on its own
export function splitFaction(groups: SlotGroup[], faction: Faction): SlotGroup[] {
    const split = groups.flatMap((group) =>
        group.factions.includes(faction) && group.factions.length > 1
            ? [
                  { ...group, factions: group.factions.filter((member) => member !== faction) },
                  { ...group, id: nextGroupId(groups), factions: [faction] }
              ]
            : [group]
    );
    return inFactionOrder(split);
}

export function updateGroup(groups: SlotGroup[], id: number, change: Partial<FactionScheme>): SlotGroup[] {
    return groups.map((group) => (group.id === id ? { ...group, ...change } : group));
}

export function withOptionsAt(group: SlotGroup, position: number, options: ISlotOptions) {
    const next = Array.from({ length: Math.max(group.options.length, position + 1) }, (_, at) => optionsAt(group, at));
    next[position] = options;
    return next;
}

const differsAt = (group: SlotGroup, saved: FactionScheme | undefined, position: number) =>
    isDirty(optionsAt(saved ?? EMPTY_SCHEME, position), optionsAt(group, position));

export function isPositionDirty(group: SlotGroup, saved: Partial<Record<Faction, FactionScheme>>, position: number) {
    return group.factions.some((faction) => differsAt(group, saved[faction], position));
}

export function isGroupDirty(group: SlotGroup, saved: Partial<Record<Faction, FactionScheme>>) {
    return group.factions.some(
        (faction) =>
            group.count !== (saved[faction]?.count ?? 0) ||
            Array.from({ length: group.count }, (_, position) => position).some((position) =>
                differsAt(group, saved[faction], position)
            )
    );
}

// How many cards sit in slots the group's count would close
export function cardsAtRisk(group: SlotGroup, slots: ISlot[], cards: IPlaytestCard[]) {
    const closing = new Set(
        group.factions.flatMap((faction) => slotsOf(slots, faction).slice(group.count)).map((slot) => slot.number)
    );
    return cards.filter((card) => closing.has(card.number)).length;
}

export function slotCountsOf(groups: SlotGroup[]): SlotCounts {
    return Object.fromEntries(groups.flatMap((group) => group.factions.map((faction) => [faction, group.count])));
}

// Each slot's options are checked as they would be saved, for every faction the group covers
export function groupErrors(groups: SlotGroup[], schema: Joi.Schema = Slot.Options): SlotOptionErrors {
    const errors: SlotOptionErrors = {};
    for (const group of groups) {
        for (let position = 0; position < group.count; position++) {
            const options = optionsAt(group, position);
            const blocker = group.factions
                .map((faction) => conditionsBlocker(options.conditions ?? [], faction))
                .find(Boolean);
            const found = { ...schemaErrors(schema, options), ...(blocker && { conditions: blocker }) };
            if (Object.keys(found).length > 0) {
                errors[errorKey(group, position)] = found;
            }
        }
    }
    return errors;
}

// The slots whose stored options differ from what their faction's group asks for at that position
export function changedSlotOptions(groups: SlotGroup[], slots: ISlot[]) {
    return groups.flatMap((group) =>
        group.factions.flatMap((faction) =>
            slotsOf(slots, faction).flatMap((slot, position) => {
                const options = optionsAt(group, position);
                return isDirty(pick(slot, slotOptionKeys), options) ? [{ number: slot.number, options }] : [];
            })
        )
    );
}
