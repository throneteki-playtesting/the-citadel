/** One entry per question asked on the suggestion form - title, blurb, help-tooltip intent/examples,
 *  and, for the plain yes/no questions, their tile labels/descriptions. */

export interface SuggestionQuestionOption {
    value: boolean;
    label: string;
    description: string;
}

export interface SuggestionQuestionMeta {
    /** Heading shown above the question - the same text in both the editor and the detail page. */
    title: string;
    /** One-line "what's being asked" - shown on the read-only detail page. */
    blurb: string;
    /** A shorter, plain-question form of `blurb` - what the editor shows instead, answerable at a glance. */
    question?: string;
    /** Why this question matters / what it's actually used for - the help tooltip's main text. Not
     *  every question carries a tooltip (Editor Notes doesn't need one), so this is optional. */
    intent?: string;
    /** Real example answers - shown only in the help tooltip, never on the read-only detail page. */
    examples?: string[];
    /** Present only for the plain yes/no questions (Iconic, Natural Trigger, Safely Limited) - their
     *  two answer tiles' labels/descriptions. */
    options?: [SuggestionQuestionOption, SuggestionQuestionOption];
}

export const SUGGESTION_QUESTIONS: Record<string, SuggestionQuestionMeta> = {
    iconic: {
        title: "Iconic Weight",
        blurb: "How much this design leans on a recognizable reference.",
        question: "How iconic is the thing this card is representing?",
        intent: "An iconic reference is something well-known from the books and/or of some relative importance. This answer will affect some checklist calculations.",
        examples: [
            "Tyrion Lannister - an iconic character",
            "The Dance of Dragons - an iconic historical period",
            "The Old Hawk - exists in the world, but is not an iconic character",
            "Weirwood Bow - generic weapon which exists in the world, but not iconic"
        ],
        options: [
            {
                value: true,
                label: "Iconic",
                description: "Leans on a recognizable reference from the source material."
            },
            { value: false, label: "Not Iconic", description: "An original or generic design, no specific reference." }
        ]
    },
    triggeredAbilityCount: {
        title: "Triggered Abilities",
        blurb: "How many separate triggered abilities (Action, Reaction, Interrupt, When Revealed, etc.) this card has.",
        question: "How many triggered abilities does this card have?",
        intent: "All triggered effects are in bold (Action, Reaction, Interrupt, When Revealed, etc.), some with phase or forced variants. A card should have very good reason for having more than 1 triggered ability.",
        examples: [
            "Winterfell Steward - a single Marshaling Action",
            "The Prince's Plan - an event with an action, and a separate reaction to return it to hand"
        ]
    },
    naturalTrigger: {
        title: "Natural Trigger",
        blurb: "Can any of this card's abilities trigger through the game's normal rules and actions alone, without needing another card's specific effect?",
        question: "Can it trigger on its own through normal gameplay?",
        intent: "Think about if this ability is ever able to trigger entirely on its own, through normal gameplay. Abilities which are reliant on other card effects are generally harder to trigger than naturally triggering ones, which affects balance considerations.",
        examples: [
            "Reaction: After you win a challenge - happens through normal play",
            "Interrupt: When a character is removed from a challenge - only another card effect can make that happen"
        ],
        options: [
            {
                value: true,
                label: "Yes",
                description: "At least one of this card's abilities can happen through normal rules and actions alone."
            },
            {
                value: false,
                label: "No",
                description: "None of this card's abilities can happen without another card's effect causing it."
            }
        ]
    },
    repeatabilityRestricted: {
        title: "Safely Limited",
        blurb: "Is every one of this card's abilities restricted - by occurring at most once per round or game, a hard limit, or a paid cost?",
        question: "Does it have reasonable limitations?",
        intent: "Check whether the ability has something implicitly or explicitly stopping it from firing more times than expected per round - usual restrictions are hard limits, impactful costs, or the trigger condition itself.",
        examples: [
            "(Limit once per phase.)",
            "Interrupt: When this character is killed",
            "Reaction: After the dominance phase begins"
        ],
        options: [
            {
                value: true,
                label: "Yes",
                description: "Every recurring ability on this card is kept in check by something."
            },
            { value: false, label: "No", description: "This card's abilities have no clear limits tied to them." }
        ]
    },
    rewardTypes: {
        title: "Rewards",
        blurb: "The tangible benefit(s) this card grants its controller when its ability resolves - gold, cards, board state, or otherwise. Most designs lean on just one or two.",
        question: "What benefits does this design grant?",
        intent: "Names the tangible upsides this design hands its controller, including keywords - useful for spotting when a single ability is quietly doing the work of two or three cards at once.",
        examples: ["Gaining gold", "Killing a character", "Moving power in your favor"]
    },
    punishment: {
        title: "Punishment",
        blurb: "Built-in drawbacks this card imposes on its own controller as the cost of its effect - a symmetrical hit, a restriction, or a stat penalty. Most designs carry at most one.",
        question: "What drawbacks does this design impose on its controller, if any?",
        intent: "Names the optional drawbacks this design imposes on its own controller as the cost of its effect - most agendas need this, and other cards use punishments to allow for more stronger rewards.",
        examples: [
            "Kill your own character to do an effect",
            "Reduce your own initiative",
            "Discarding a card from your own hand or deck"
        ]
    },
    pivotPoints: {
        title: "Pivot Points",
        blurb: "Elements of this design flagged for future balance adjustment - buff or nerf.",
        question: "What could be tuned to balance this design?",
        intent: "Flags what you would consider as points of balance for this card to finetune it - simpler designs with more pivot points are preferred over designs which have no wiggle room.",
        examples: ["The gold cost of the card", "The number of cards it draws", "How many targets it can hit at once"]
    },
    comparableCards: {
        title: "Comparable Cards",
        blurb: "Existing released cards a reviewer could hold up next to this one to judge whether its power level and cost feel right - the closer the comparison, the more useful it is.",
        question: "Which released cards compare to this one?",
        intent: "Points a reviewer at existing released cards with a similar role or power level, so they have a real anchor to judge this design's cost and strength against. Additionally helps identify if this card already exists in a similar form.",
        examples: [
            "A card with a near-identical ability at a known cost",
            "A card from the same faction filling a similar deck role"
        ]
    },
    combosWith: {
        title: "Combos With",
        blurb: "Released cards this design was specifically built to pair with, or that meaningfully amplify what it does - call out interactions worth a reviewer's attention, not just cards that happen to share a trait.",
        question: "Which released cards does this combo with?",
        intent: "Calls out released cards this design was specifically built to pair with, or that meaningfully amplify it.",
        examples: [
            "Another card which this one easily triggers from",
            "A card which shares an important trait with this one to make it work better"
        ]
    },
    checklistReview: {
        title: "Checklist Review",
        blurb: "Rules that don't pass automatically carry a short justification for why that's still acceptable.",
        question: "Review your checklist and justify any issues, if any.",
        intent: "Every rule that isn't a clean pass needs a short note to justify why that's still an acceptable trade-off for this specific design - it's what a reviewer reads first when judging a warning.",
        examples: [
            "This Targaryen 6+ cost character should align with their core theme of polarising cost curves",
            "The scope of cards this can work with is significantly small, so its stats are intentionally better"
        ]
    },
    editorNotes: {
        title: "Editor Notes",
        blurb: "Context a reviewer wouldn't get from the checklist, questions, or card alone."
    }
};
