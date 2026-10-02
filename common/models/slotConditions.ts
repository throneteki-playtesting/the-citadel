import { upperFirst } from "lodash-es";
import { ChallengeIcon, challengeIcons, costTypes, Faction, ICard, PlotStat, Type, types, uniqueTypes } from "./cards";
import { deriveFields } from "../designGuidelines/deriveFields";
import { typeNames } from "../utils";

const orList = new Intl.ListFormat("en-GB", { type: "disjunction" });
const joinOr = (items: string[]) => orList.format(items);

export const rangeStats = ["cost", "strength", "deckLimit", "income", "initiative", "claim", "reserve"] as const;
export type RangeStat = (typeof rangeStats)[number];

// In the card editor's own order, so a slot's conditions read down the same way a card's fields do
export const conditionStats = [
    "loyal",
    "type",
    "cost",
    "unique",
    "strength",
    "icons",
    "income",
    "initiative",
    "claim",
    "reserve",
    "traits",
    "keywords",
    "deckLimit"
] as const;
export type ConditionStat = (typeof conditionStats)[number];

export type Range = { min?: number; max?: number };

// One thing a slot asks of its card - a slot holds at most one per stat, each advisory
export type SlotCondition =
    | { stat: "type"; types: Type[] }
    | { stat: "unique" | "loyal"; value: boolean }
    | ({ stat: RangeStat } & Range)
    | { stat: "icons"; icons: Partial<Record<ChallengeIcon, boolean>> }
    | { stat: "traits"; traits: string[] }
    | { stat: "keywords"; keywords: string[] };

export const conditionLabels: Record<ConditionStat, string> = {
    type: "Type",
    unique: "Uniqueness",
    loyal: "Loyalty",
    cost: "Cost",
    strength: "Strength",
    deckLimit: "Deck limit",
    income: "Income",
    initiative: "Initiative",
    claim: "Claim",
    reserve: "Reserve",
    icons: "Challenge icons",
    traits: "Traits",
    keywords: "Keywords"
};

const plotOnly: readonly Type[] = ["plot"];
// The types a stat exists on - a stat missing here exists on every type
const statTypes: Partial<Record<ConditionStat, readonly Type[]>> = {
    unique: uniqueTypes,
    loyal: types.filter((type) => type !== "agenda"),
    cost: costTypes,
    strength: ["character"],
    icons: ["character"],
    income: plotOnly,
    initiative: plotOnly,
    claim: plotOnly,
    reserve: plotOnly
};

// Why a stat can't be asked for yet, or undefined when it can - every type the slot allows has to carry it
export function conditionBlocker(stat: ConditionStat, conditions: SlotCondition[], faction?: Faction) {
    if (stat === "loyal" && faction === "neutral") {
        return "Neutral cards can't be loyal";
    }
    const supported = statTypes[stat];
    if (!supported) {
        return undefined;
    }
    const typeCondition = conditions.find((condition) => condition.stat === "type");
    const allowed = typeCondition?.stat === "type" ? typeCondition.types : [];
    if (allowed.length === 0) {
        return `Needs a ${joinOr(supported.map((type) => typeNames[type]))} type first`;
    }
    const unsupported = allowed.filter((type) => !supported.includes(type));
    return unsupported.length > 0
        ? `${joinOr(unsupported.map((type) => typeNames[type]))} cards have no ${conditionLabels[stat].toLowerCase()}`
        : undefined;
}

// What a stat needs before it can be asked for, as a heading to gather blocked stats under - eg. "Plots only"
export function conditionRequirement(stat: ConditionStat, faction?: Faction) {
    if (stat === "loyal" && faction === "neutral") {
        return "Not on neutral slots";
    }
    const supported = statTypes[stat];
    if (!supported) {
        return undefined;
    }
    const plural = (type: Type) => `${typeNames[type]}s`;
    const excluded = types.filter((type) => !supported.includes(type));
    return excluded.length === 1
        ? `Not for ${plural(excluded[0]).toLowerCase()}`
        : `${joinOr(supported.map(plural))} only`;
}

// The first condition its slot can't carry, and why - the one statement of that rule for the schema and the API
export function conditionsBlocker(conditions: SlotCondition[], faction?: Faction) {
    for (const condition of conditions) {
        const reason = conditionBlocker(condition.stat, conditions, faction);
        if (reason) {
            return `${conditionLabels[condition.stat]}: ${reason}`;
        }
    }
    return undefined;
}

// Drops whatever the conditions no longer allow - run after the type changes, so nothing is left asking the impossible
export function withoutBlockedConditions(conditions: SlotCondition[], faction?: Faction) {
    return conditions.filter((condition) => !conditionBlocker(condition.stat, conditions, faction));
}

export function formatRange({ min, max }: Range) {
    if (min !== undefined && max !== undefined) {
        return min === max ? `${min}` : `${min}–${max}`;
    }
    return min !== undefined ? `${min}+` : `≤${max}`;
}

// The condition in words, as a slot's summary lists it
export function describeCondition(condition: SlotCondition) {
    switch (condition.stat) {
        case "type":
            return joinOr(condition.types.map((type) => typeNames[type]));
        case "unique":
            return condition.value ? "Unique" : "Not unique";
        case "loyal":
            return condition.value ? "Loyal" : "Not loyal";
        case "icons":
            return challengeIcons
                .flatMap((icon) => {
                    const required = condition.icons[icon];
                    return required === undefined ? [] : [describeIcon(icon, required)];
                })
                .join(", ");
        case "traits":
            return `Traits: ${joinOr(condition.traits)}`;
        case "keywords":
            return `Keywords: ${joinOr(condition.keywords)}`;
        default:
            return `${conditionLabels[condition.stat]} ${formatRange(condition)}`;
    }
}

export function describeIcon(icon: ChallengeIcon, required: boolean) {
    return `${upperFirst(icon)} ${required ? "required" : "forbidden"}`;
}

// Where a card strays from its slot's conditions, worded for a warning beside it. X and "-" never stray
export function slotConditionIssues(conditions: SlotCondition[] = [], card: ICard) {
    return conditions.flatMap((condition) => {
        const issue = conditionIssue(condition, card);
        return issue ? [issue] : [];
    });
}

function conditionIssue(condition: SlotCondition, card: ICard): string | undefined {
    switch (condition.stat) {
        case "type":
            return condition.types.includes(card.type)
                ? undefined
                : `The slot asks for ${joinOr(condition.types.map(withArticle))}`;
        case "unique":
        case "loyal":
            return !!card[condition.stat] === condition.value
                ? undefined
                : `The slot asks for ${condition.value ? "a" : "a non-"}${condition.stat} card`;
        case "icons": {
            const wrong = challengeIcons.filter(
                (icon) => condition.icons[icon] !== undefined && !!card.icons?.[icon] !== condition.icons[icon]
            );
            return wrong.length === 0 ? undefined : `Challenge icons should be: ${describeCondition(condition)}`;
        }
        case "traits": {
            const traits = card.traits.map((trait) => trait.toLowerCase());
            return condition.traits.some((trait) => traits.includes(trait.toLowerCase()))
                ? undefined
                : `The slot asks for ${joinOr(condition.traits)}`;
        }
        case "keywords": {
            const keywords = deriveFields(card.text ?? "").keywords.map(({ keyword }) => keyword);
            return condition.keywords.some((keyword) => keywords.includes(keyword))
                ? undefined
                : `The slot asks for ${joinOr(condition.keywords)}`;
        }
        default: {
            const value = rangeValue(card, condition.stat);
            const { min, max } = condition;
            const isOutside =
                typeof value === "number" && ((min !== undefined && value < min) || (max !== undefined && value > max));
            return isOutside
                ? `${conditionLabels[condition.stat]} ${value} is outside the slot's ${formatRange(condition)}`
                : undefined;
        }
    }
}

function rangeValue(card: ICard, stat: RangeStat) {
    switch (stat) {
        case "cost":
            return card.cost;
        case "strength":
            return card.strength;
        case "deckLimit":
            return card.deckLimit;
        default:
            return card.plotStats?.[stat as PlotStat];
    }
}

function withArticle(type: Type) {
    return `${/^[aeiou]/.test(type) ? "an" : "a"} ${typeNames[type].toLowerCase()}`;
}
