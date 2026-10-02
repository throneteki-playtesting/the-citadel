import type { IProject } from "./projects";
import { plainLength } from "../richText/toPlain";

/** Something a draft project needs before it can be initialised */
export interface IInitialisationRequirement {
    label: string;
    /** What is left, drawn dimmed beside the label */
    detail?: string;
    done: boolean;
}

// The one statement of what initialising needs - the checklist draws it, and the API refuses on its first unmet entry
export function initialisationRequirements(
    project: Pick<IProject, "emoji" | "description">,
    slots: { number: number }[],
    cards: { number: number }[]
): IInitialisationRequirement[] {
    const optionCounts = slots.map((slot) => cards.filter((card) => card.number === slot.number).length);
    const empty = optionCounts.filter((count) => count === 0).length;
    const contested = optionCounts.filter((count) => count > 1).length;
    return [
        { label: "Discord emoji chosen", done: !!project.emoji },
        { label: "Description written", done: plainLength(project.description ?? "") > 0 },
        { label: "Every slot has a card", detail: empty > 0 ? `${empty} empty` : undefined, done: empty === 0 },
        {
            label: "Every slot has settled on one card",
            detail: contested > 0 ? `${contested} with several options` : undefined,
            done: contested === 0
        }
    ];
}
