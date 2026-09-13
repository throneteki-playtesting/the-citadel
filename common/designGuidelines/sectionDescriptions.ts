// One place for every design-question section's helper text, shared by the suggestion editor and
// the read-only detail page so the wording can't drift between them.
export const SUGGESTION_SECTION_DESCRIPTIONS = {
    iconic: "How much this design leans on a recognizable reference.",
    abilityTypes: "The kinds of abilities this card provides.",
    triggerReliability: "How likely these effect(s) are to trigger - more than one can apply.",
    triggerRepeatability: "How often these effect(s) can be used, and what keeps that in check.",
    rewardTypes:
        "The tangible benefit(s) this card grants its controller when its ability resolves - gold, cards, board state, or otherwise. Most designs lean on just one or two.",
    punishment:
        "Built-in drawbacks this card imposes on its own controller as the cost of its effect - a symmetrical hit, a restriction, or a stat penalty. Most designs carry at most one.",
    pivotPoints: "Elements of this design flagged for future balance adjustment - buff or nerf.",
    comparableCards:
        "Existing printed cards a reviewer could hold up next to this one to judge whether its power level and cost feel right - the closer the comparison, the more useful it is.",
    combosWith:
        "Printed cards this design was specifically built to pair with, or that meaningfully amplify what it does - call out interactions worth a reviewer's attention, not just cards that happen to share a trait.",
    checklistReview: "Rules that don't pass automatically carry a short justification for why that's still acceptable.",
    editorNotes: "Context a reviewer wouldn't get from the checklist, questions, or card alone."
} as const;
