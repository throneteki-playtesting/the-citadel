import type { IProject } from "./projects";
import type { ICard } from "./cards";
import type { ISlot } from "./slots";
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
}

// The one statement of what initialising needs - the checklist draws it, and the API refuses on its first unmet entry
export function initialisationRequirements(
    project: Pick<IProject, "emoji" | "description">,
    slots: Pick<ISlot, "number" | "conditions">[],
    cards: (ICard & { number: number })[]
): IInitialisationRequirement[] {
    const slotCards = slots.map((slot) => ({ slot, cards: cards.filter((card) => card.number === slot.number) }));
    const settled = slotCards.filter(({ cards }) => cards.length === 1);
    const requirements: IInitialisationRequirement[] = [
        { label: "Discord emoji chosen", done: !!project.emoji },
        { label: "Description written", done: plainLength(project.description ?? "") > 0 },
        {
            label: "Every slot has exactly one card",
            detail: `${settled.length}/${slots.length}`,
            done: settled.length === slots.length
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
