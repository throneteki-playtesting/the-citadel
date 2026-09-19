import { ICard, ISuggestionQuestions } from "../models/cards";

/** Returns `undefined` when there's no guideline strength to compute against - non-character cards,
 *  a non-numeric cost, `iconic` not yet answered, or a triggered ability declared but its
 *  `naturalTrigger` answer not yet given (the calculation depends on both). */
export function computeStrength(
    card: Pick<ICard, "type" | "cost" | "icons">,
    questions: Pick<ISuggestionQuestions, "triggeredAbilityCount" | "naturalTrigger" | "iconic">
): number | undefined {
    const naturalTriggerPending = (questions.triggeredAbilityCount ?? 0) > 0 && questions.naturalTrigger === undefined;
    if (
        card.type !== "character" ||
        typeof card.cost !== "number" ||
        questions.iconic === undefined ||
        naturalTriggerPending
    ) {
        return undefined;
    }

    let strength = card.cost;

    const iconCount = [card.icons?.military, card.icons?.intrigue, card.icons?.power].filter(Boolean).length;
    if (iconCount === 1) {
        strength += 1;
    } else if (iconCount === 3) {
        strength -= 1;
    }

    if (questions.naturalTrigger) {
        strength -= 1;
    }

    if (questions.iconic) {
        strength += 1;
    }

    return strength;
}
