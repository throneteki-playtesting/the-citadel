import {
    ChecklistRuleId,
    ICard,
    IDerivedFields,
    ISuggestionQuestions,
    plotStats as PLOT_STAT_KEYS
} from "../models/cards";
import { computeStrength } from "./computeStrength";
import { computePlotBudget } from "./computePlotBudget";
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

/** Returns only the rules applicable right now - a rule with nothing to say yet is omitted entirely,
 *  not shown as a forced pass. Must agree byte-for-byte across every client and server caller. */
export function checklistRules(input: {
    card: ICard;
    questions: ISuggestionQuestions;
    /** Server-computed from `card.text`, never asked of anyone - not currently read by any rule here. */
    derived: IDerivedFields;
    pivotPoints: string[];
    /** only needed for plot-type suggestions */
    plotMedian?: number;
    rewardTypes: { id: string; label: string; tags: string[] }[];
    punishmentTypes: { id: string; label: string }[];
    /** Tags which, when present on a selected reward, trigger the loyaltyConsistency rule below */
    loyaltyTags: string[];
}): RuleResult[] {
    const { card, questions, pivotPoints, plotMedian, rewardTypes, punishmentTypes, loyaltyTags } = input;
    const results: RuleResult[] = [];

    if (card.type === "character") {
        const guideline = computeStrength(card, questions);
        if (guideline === undefined) {
            // Same priority order computeStrength itself checks in, so the reason given always
            // matches the actual first thing blocking the calculation.
            const reason =
                typeof card.cost !== "number"
                    ? "this card has a numeric cost"
                    : questions.iconic === undefined
                      ? "you've answered whether this design is iconic"
                      : "you've answered whether it triggers naturally";
            results.push({
                rule: "strGuideline",
                status: "indeterminate",
                label: "Printed STR aligns with card stats",
                description: `Cannot be evaluated until ${reason}.`,
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
                ? `You've selected ${count} reward types (${listLabels(rewardTypes, questions.rewardTypes)}) - three or more spreads this ability's focus thin.`
                : `You've selected ${count} ${pluralize(count, "reward type")} (${listLabels(rewardTypes, questions.rewardTypes)}), a clear and narrow focus.`
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
                ? `You've selected ${count} punishment types (${listLabels(punishmentTypes, questions.punishment)}) - stacking multiple punishments can overly penalize this card.`
                : `You've selected ${count} ${pluralize(count, "punishment type")} (${listLabels(punishmentTypes, questions.punishment)}), a clear and narrow focus.`
        });
    }

    const loyaltyTaggedRewards =
        questions.rewardTypes?.filter((id) =>
            rewardTypes.find((r) => r.id === id)?.tags.some((t) => loyaltyTags.includes(t))
        ) ?? [];
    if (card.faction !== "neutral" && loyaltyTaggedRewards.length > 0) {
        results.push({
            rule: "loyaltyConsistency",
            status: card.loyal ? "pass" : "warn",
            label: "Chosen rewards suggest loyalty",
            description: card.loyal
                ? `This card grants ${listLabels(rewardTypes, loyaltyTaggedRewards)} and is correctly marked Loyal.`
                : `This card grants ${listLabels(rewardTypes, loyaltyTaggedRewards)} but isn't marked Loyal.`,
            tooltip: `Triggered by: ${listLabels(rewardTypes, loyaltyTaggedRewards)}.`
        });
    }

    const triggeredAbilityCount = questions.triggeredAbilityCount ?? 0;
    if (triggeredAbilityCount > 0) {
        const focusPass = triggeredAbilityCount === 1;
        results.push({
            rule: "triggeredAbilityFocus",
            status: focusPass ? "pass" : "warn",
            label: "Triggered abilities are clear and narrow",
            description: focusPass
                ? "This card has 1 triggered ability, a clear and narrow focus."
                : `This card has ${triggeredAbilityCount} triggered abilities - more than one spreads this design's focus thin.`
        });

        const isRestricted = questions.repeatabilityRestricted;
        if (isRestricted === undefined) {
            results.push({
                rule: "repeatabilityControl",
                status: "indeterminate",
                label: "Abilities are safely limited",
                description:
                    "Cannot be evaluated until you've answered whether this card's abilities are safely limited."
            });
        } else {
            results.push({
                rule: "repeatabilityControl",
                status: isRestricted ? "pass" : "warn",
                label: "Abilities are safely limited",
                description: isRestricted
                    ? "This card's abilities are kept in check by occurring at most once per round or game, a hard limit, or a paid cost."
                    : "This card's abilities can recur across a game with nothing restricting them."
            });
        }
    }

    if (card.type === "plot") {
        const stats = card.plotStats;
        const hasAllStats = !!stats && PLOT_STAT_KEYS.every((key) => stats[key] !== undefined);
        const tooltip = "Weighted by each stat's usefulness, compared against other plots.";

        if (!hasAllStats) {
            results.push({
                rule: "plotBudget",
                status: "indeterminate",
                label: "Plot stats are balanced",
                description: "Cannot be evaluated until all four plot stats have been filled in.",
                tooltip
            });
        } else if (plotMedian === undefined) {
            results.push({
                rule: "plotBudget",
                status: "indeterminate",
                label: "Plot stats are balanced",
                description: "Cannot be evaluated until existing plots' stats are available to compare against.",
                tooltip
            });
        } else {
            const budget = computePlotBudget(stats);
            const pass = budget <= plotMedian;
            results.push({
                rule: "plotBudget",
                status: pass ? "pass" : "warn",
                label: "Plot stats are balanced",
                description: pass
                    ? `This plot's weighted stat score (${budget}) is equal to or lower than the typical score for existing plots (${plotMedian}).`
                    : `This plot's weighted stat score (${budget}) is higher than the typical score for existing plots (${plotMedian}).`,
                tooltip
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
