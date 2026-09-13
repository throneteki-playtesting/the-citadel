import { ICard, ISuggestionQuestions, TriggerReliability } from "../models/cards";

// A semantic key rather than an imported icon component - common/ has no UI dependency.
export type TriggerReliabilityIcon = "recur" | "pointer" | "link";

export interface TriggerReliabilityDefinition {
    id: TriggerReliability;
    label: string;
    description: string;
    /** a short, realistic phrase - shown under the description as a concrete anchor */
    example: string;
    icon: TriggerReliabilityIcon;
}

export const TRIGGER_RELIABILITIES: TriggerReliabilityDefinition[] = [
    {
        id: "natural",
        label: "Natural Gameplay",
        description: "Triggers from normal gameplay.",
        example: "Reaction: After you win a challenge...",
        icon: "recur"
    },
    {
        id: "discretionary",
        label: "At Player's Discretion",
        description: "Player can trigger, when available.",
        example: "Action: Kneel this character to...",
        icon: "pointer"
    },
    {
        id: "dependent",
        label: "Dependent",
        description: "Requires an unnatural effect to trigger.",
        example: "Interrupt: When a character is removed from a challenge...",
        icon: "link"
    }
];

/** Returns `undefined` when there's no guideline strength to compute against - non-character cards,
 *  a non-numeric cost, or `iconic` not yet answered (the calculation depends on it). */
export function computeStrength(
    card: Pick<ICard, "type" | "cost" | "icons">,
    questions: Pick<ISuggestionQuestions, "triggerReliability" | "iconic">
): number | undefined {
    if (card.type !== "character" || typeof card.cost !== "number" || questions.iconic === undefined) {
        return undefined;
    }

    let strength = card.cost;

    const iconCount = [card.icons?.military, card.icons?.intrigue, card.icons?.power].filter(Boolean).length;
    if (iconCount === 1) {
        strength += 1;
    } else if (iconCount === 3) {
        strength -= 1;
    }

    if (questions.triggerReliability?.includes("natural")) {
        strength -= 1;
    }
    if (questions.triggerReliability?.includes("discretionary")) {
        strength -= 1;
    }

    if (questions.iconic) {
        strength += 1;
    }

    return strength;
}
