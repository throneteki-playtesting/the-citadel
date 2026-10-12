import type { IProject } from "./projects";
import type { ICard } from "./cards";
import { previewOf, type ISlot } from "./slots";
import { plainLength } from "../richText/toPlain";
import { slotConditionIssues } from "./slotConditions";

/** Something a draft project needs before it can be initialised */
export interface IInitialisationRequirement {
    label: string;
    /** What is left, drawn dimmed beside the label */
    detail?: string;
    done: boolean;
    /** Done, but with something worth a second look */
    warning?: boolean;
    /** Drawn for information only - never holds initialising back */
    advisory?: boolean;
    /** Said in a tooltip on the label, for what the label alone doesn't explain */
    hint?: string;
}

// The one statement of what initialising needs - the checklist draws it, and the API refuses on its first unmet entry
export function initialisationRequirements(
    project: Pick<IProject, "emoji" | "description">,
    slots: Pick<ISlot, "number" | "conditions" | "_metadata">[],
    cards: (ICard & { number: number })[]
): IInitialisationRequirement[] {
    const slotCards = slots.map((slot) => ({ slot, cards: cards.filter((card) => card.number === slot.number) }));
    const settled = slotCards.filter(({ cards }) => cards.length === 1);
    // A preview of any card of a slot is enough - it may have changed or gone since, but somebody has been shown
    const revealed = slots.filter((slot) => previewOf(slot));
    const requirements: IInitialisationRequirement[] = [
        { label: "Discord emoji chosen", done: !!project.emoji },
        { label: "Description written", done: plainLength(project.description ?? "") > 0 },
        {
            label: "Every slot has exactly one card",
            detail: `${settled.length}/${slots.length}`,
            done: settled.length === slots.length
        },
        {
            label: "Every slot revealed to the design team",
            hint: "Slots with a revealed card are highlighted green.",
            detail: `${revealed.length}/${slots.length}`,
            done: revealed.length === slots.length
        }
    ];

    if (slots.some((slot) => slot.conditions?.length)) {
        const settledWithConditions = settled.filter(({ slot }) => slot.conditions?.length);
        const straying = settledWithConditions.filter(
            ({ slot, cards }) => slotConditionIssues(slot.conditions, cards[0]).length > 0
        ).length;
        requirements.push({
            label: "Every card aligns with slot conditions",
            detail: straying > 0 ? `${straying} straying` : undefined,
            done: settledWithConditions.length > 0,
            warning: straying > 0,
            advisory: true
        });
    }

    return requirements;
}

/** The first requirement holding initialising back, if any */
export function unmetRequirement(requirements: IInitialisationRequirement[]) {
    return requirements.find((requirement) => !requirement.done && !requirement.advisory);
}
