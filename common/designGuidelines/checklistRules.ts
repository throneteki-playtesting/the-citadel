import { ChecklistRuleId, ICard, IDerivedFields, ISuggestionQuestions } from "../models/cards";
import { computeStrength } from "./computeStrength";
import { computePlotBudget } from "./computePlotBudget";
import { REWARD_TYPES } from "./rewardTypes";
import { PUNISHMENT_TYPES } from "./punishmentTypes";
import { PIVOT_POINT_HEALTHY_MIN } from "./pivotPoints";

export interface RuleResult {
    rule: ChecklistRuleId;
    /** "indeterminate" is neither pass nor warn - the rule genuinely cannot be evaluated yet */
    status: "pass" | "warn" | "indeterminate";
    /** Fixed, short, worded as a statement of the property being checked, never as a recommendation */
    label: string;
    /** Personalized to the actual answers given, not a static restatement of the rule - a submitter
     *  reads this back when justifying a warning, so it has to say what's actually going on. */
    description: string;
    /** Extra explanatory detail that doesn't belong inline - eg. what a calculated number means */
    tooltip?: string;
}

function labelFor(options: { id: string; label: string }[], id: string) {
    return options.find((o) => o.id === id)?.label ?? id;
}

function joinWithAnd(labels: string[]) {
    if (labels.length <= 1) {
        return labels[0] ?? "";
    }
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function listLabels(options: { id: string; label: string }[], ids: string[]) {
    return joinWithAnd(ids.map((id) => labelFor(options, id)));
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`) {
    return count === 1 ? singular : plural;
}

// Economic-flavored reward types the guide names as "economic" - modifyInitiative/modifyClaim are
// deliberately excluded, since the guide only calls income/reserve "economic"
const ECONOMIC_REWARD_TYPES = [
    "gainsGold",
    "drawsCards",
    "modifyIncome",
    "modifyReserve",
    "reducesCosts",
    "goldOnCards"
];

/** Returns only the rules applicable right now - a rule with nothing to say yet is omitted entirely,
 *  not shown as a forced pass. Must agree byte-for-byte across every client and server caller. */
export function checklistRules(input: {
    card: ICard;
    questions: ISuggestionQuestions;
    derived: IDerivedFields;
    pivotPoints: string[];
    /** only needed for plot-type suggestions */
    plotMedian?: number;
}): RuleResult[] {
    const { card, questions, pivotPoints, plotMedian } = input;
    const results: RuleResult[] = [];

    if (card.type === "character") {
        const guideline = computeStrength(card, questions);
        if (guideline === undefined) {
            results.push({
                rule: "strGuideline",
                status: "indeterminate",
                label: "Printed STR aligns with card stats",
                description: "Cannot be evaluated until this card has a numeric cost.",
                tooltip: "Calculated from the card's cost, icon count, and how reliably its ability triggers."
            });
        } else {
            const pass = typeof card.strength === "number" && card.strength <= guideline;
            results.push({
                rule: "strGuideline",
                status: pass ? "pass" : "warn",
                label: "Printed STR aligns with card stats",
                description: pass
                    ? `Your printed STR (${card.strength}) is equal to or lower than the calculated recommended value (${guideline}).`
                    : `Your printed STR (${card.strength}) is higher than the calculated recommended value (${guideline}).`,
                tooltip: `STR ${guideline} or lower is recommended, calculated from cost, icon count, and trigger reliability.`
            });
        }
    }

    if ((questions.rewardTypes?.length ?? 0) > 0) {
        const count = questions.rewardTypes.length;
        const warn = count >= 3;
        results.push({
            rule: "rewardFocus",
            status: warn ? "warn" : "pass",
            label: "Reward types are clear and narrow",
            description: warn
                ? `You've selected ${count} reward types (${listLabels(REWARD_TYPES, questions.rewardTypes)}) - three or more spreads this ability's focus thin.`
                : `You've selected ${count} ${pluralize(count, "reward type")} (${listLabels(REWARD_TYPES, questions.rewardTypes)}), a clear and narrow focus.`
        });
    }

    if ((questions.punishment?.length ?? 0) > 0) {
        const count = questions.punishment.length;
        const warn = count > 1;
        results.push({
            rule: "punishmentFocus",
            status: warn ? "warn" : "pass",
            label: "Punishments are clear and narrow",
            description: warn
                ? `You've selected ${count} punishment types (${listLabels(PUNISHMENT_TYPES, questions.punishment)}) - stacking multiple punishments can overly penalize this card.`
                : `You've selected ${count} ${pluralize(count, "punishment type")} (${listLabels(PUNISHMENT_TYPES, questions.punishment)}), a clear and narrow focus.`
        });
    }

    const economicRewards = questions.rewardTypes?.filter((type) => ECONOMIC_REWARD_TYPES.includes(type)) ?? [];
    if (card.faction !== "neutral" && economicRewards.length > 0) {
        results.push({
            rule: "loyaltyConsistency",
            status: card.loyal ? "pass" : "warn",
            label: "Economic rewards are paired with loyalty",
            description: card.loyal
                ? `This card grants ${listLabels(REWARD_TYPES, economicRewards)} and is correctly marked Loyal.`
                : `This card grants ${listLabels(REWARD_TYPES, economicRewards)} but isn't marked Loyal.`
        });
    }

    // `oneTime` isn't an exemption from this rule - it's one of the ways an ability answers it, same
    // as a hard limit or a paid cost.
    if (card.type !== "event" && questions.abilityTypes?.includes("triggered")) {
        const { hardLimit, paidCost, oneTime } = questions.repeatability ?? {};
        const mechanisms = [
            oneTime && "a one-time trigger",
            hardLimit && "a hard limit",
            paidCost && "a paid cost"
        ].filter(Boolean) as string[];
        results.push({
            rule: "repeatabilityControl",
            status: mechanisms.length > 0 ? "pass" : "warn",
            label: "Abilities are safely limited",
            description:
                mechanisms.length > 0
                    ? `This ability is safely limited by ${joinWithAnd(mechanisms)}.`
                    : "This ability can recur across a game with no hard limit or paid cost restricting it."
        });
    }

    if (card.type === "plot") {
        if (plotMedian === undefined) {
            results.push({
                rule: "plotBudget",
                status: "indeterminate",
                label: "Plot stat total stays near the pool median",
                description: "Cannot be evaluated until the ThronesDB plot pool median is available."
            });
        } else if (card.plotStats) {
            const budget = computePlotBudget({
                income: typeof card.plotStats.income === "number" ? card.plotStats.income : 0,
                initiative: typeof card.plotStats.initiative === "number" ? card.plotStats.initiative : 0,
                claim: typeof card.plotStats.claim === "number" ? card.plotStats.claim : 0,
                reserve: typeof card.plotStats.reserve === "number" ? card.plotStats.reserve : 0
            });
            const warn = budget > plotMedian * 1.3;
            const overBy = Math.round(((budget - plotMedian) / plotMedian) * 100);
            results.push({
                rule: "plotBudget",
                status: warn ? "warn" : "pass",
                label: "Plot stat total stays near the pool median",
                description: warn
                    ? `This plot's stat total (${budget}) is ${overBy}% over the pool median (${plotMedian}).`
                    : `This plot's stat total (${budget}) stays within the pool median (${plotMedian}).`,
                tooltip: "Stat total = income*2 + initiative + claim*5 + reserve."
            });
        }
    }

    const pivotCount = pivotPoints.length;
    const warnPivots = pivotCount < PIVOT_POINT_HEALTHY_MIN;
    results.push({
        rule: "pivotPointBalance",
        status: warnPivots ? "warn" : "pass",
        label: "Enough pivot points are provided",
        description:
            pivotCount === 0
                ? `No pivot points have been provided - we recommend simpler designs with at least ${PIVOT_POINT_HEALTHY_MIN} clear pivot points.`
                : warnPivots
                  ? `Only ${pivotCount} pivot point has been provided - we recommend simpler designs with at least ${PIVOT_POINT_HEALTHY_MIN} clear pivot points.`
                  : `${pivotCount} pivot points are provided, documenting this design's dependencies.`
    });

    return results;
}
