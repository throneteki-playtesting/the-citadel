import { StatusCodes } from "http-status-codes";
import { omit } from "lodash-es";
import { Faction, factions } from "common/models/cards";
import { IProject, projectTemplateOf, SlotCounts, templateCounts, TemplateSlots } from "common/models/projects";
import { conditionsBlocker } from "common/models/slotConditions";
import { DefaultSlotStatuses, ISlot, ISlotOptions, slotOptionKeys } from "common/models/slots";
import * as Schemas from "common/models/schemas";
import { ApiErrorResponse } from "@/errors";
import { dataService } from "@/services";
import { syncProjectCardCount } from "@/utils";
import { logActivity, projectSnapshot } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";

/** How many slots each faction should have, and - where a template is being laid out - what each one asks for */
type SlotRequest = { counts: SlotCounts; options?: TemplateSlots };

// A template is written by hand, so a slot it couldn't have saved through the editor is caught before any are laid out
function assertTemplateSlots(name: string, slots: TemplateSlots) {
    for (const faction of factions) {
        slots[faction].forEach((options, position) => {
            const problem =
                Schemas.Slot.Options.validate(options).error?.message ??
                conditionsBlocker(options.conditions ?? [], faction);
            if (problem) {
                throw new ApiErrorResponse(
                    StatusCodes.INTERNAL_SERVER_ERROR,
                    "Invalid Template",
                    `The ${name} template's ${faction} slot ${position + 1} is invalid: ${problem}`
                );
            }
        });
    }
}

// A template's slots are the project's; only a custom project sets its own counts
export function requestedSlots(project: IProject, slotCounts?: SlotCounts, previous?: IProject) {
    const template = projectTemplateOf(project);
    if (!template) {
        throw new ApiErrorResponse(
            StatusCodes.BAD_REQUEST,
            "Invalid Data",
            `'${project.template}' is not a template for ${project.type} projects`
        );
    }
    if (!template.slots) {
        return slotCounts && ({ counts: slotCounts } as SlotRequest);
    }
    if (slotCounts) {
        throw new ApiErrorResponse(
            StatusCodes.BAD_REQUEST,
            "Invalid Data",
            `Slot counts are set by the ${template.name} template`
        );
    }
    // Laid out once, as the template is chosen - from then on what each slot asks for is the project's to change
    const isChosen = !previous || projectTemplateOf(previous) !== template;
    if (isChosen) {
        assertTemplateSlots(template.name, template.slots);
    }
    return { counts: templateCounts(template), options: isChosen ? template.slots : undefined } as SlotRequest;
}

// Opens, creates or closes slots to reach the counts - closing takes a faction's last slots, whatever they hold
export async function applySlots(project: IProject, { counts, options }: SlotRequest) {
    const slots = (await dataService.slots.read({ project: project.number })).sort((a, b) => a.number - b.number);
    const updating: ISlot[] = [];
    const closing: ISlot[] = [];
    const creating: { faction: Faction; options: ISlotOptions }[] = [];
    let reopened = 0;

    for (const faction of factions) {
        const target = counts[faction];
        if (target === undefined) {
            continue;
        }
        const open = slots.filter((slot) => slot.faction === faction && !slot.closed);
        const closed = slots.filter((slot) => slot.faction === faction && slot.closed);
        const kept = open.slice(0, target);
        const reopening = closed.slice(0, Math.max(0, target - open.length));
        const asked = options?.[faction];
        const optionsAt = (position: number) => asked?.[position] ?? {};

        // Closed slots are a faction's last, so kept, reopened and created is also the order of their numbers
        const staying = [...kept, ...reopening.map((slot) => ({ ...slot, closed: false }))];
        if (asked) {
            updating.push(...staying.map((slot, at) => ({ ...omit(slot, slotOptionKeys), ...optionsAt(at) }) as ISlot));
        } else {
            updating.push(...staying.slice(kept.length));
        }
        for (let position = staying.length; position < target; position++) {
            creating.push({ faction, options: optionsAt(position) });
        }
        closing.push(...open.slice(target));
        reopened += reopening.length;
    }

    const opened = reopened + creating.length;
    if (updating.length + closing.length + creating.length === 0) {
        return project;
    }
    const highest = slots.at(-1)?.number ?? 0;

    // A closed slot lets go of its cards, so a suggestion among them is free to be drafted elsewhere
    const released =
        closing.length > 0
            ? await dataService.cards.destroy(
                  closing.map((slot) => ({ project: project.number, number: slot.number })),
                  false
              )
            : [];

    const changed = [...updating, ...closing.map((slot) => ({ ...slot, closed: true, preferences: undefined }))];
    if (changed.length > 0) {
        await dataService.slots.update(changed);
    }
    if (creating.length > 0) {
        await dataService.slots.create(
            creating.map(
                ({ faction, options: asked }, i) =>
                    ({
                        project: project.number,
                        number: highest + 1 + i,
                        faction,
                        ...asked,
                        statuses: DefaultSlotStatuses
                    }) as ISlot
            )
        );
    }

    if (opened + closing.length > 0) {
        await logActivity(
            LogCategory.SLOT,
            "slot.counts_updated",
            `<principal> opened ${opened} and closed ${closing.length} slots in <project>, releasing ${released.length} cards`,
            { context: { project: projectSnapshot(project) }, severity: closing.length > 0 ? "warn" : undefined }
        );
    }
    return syncProjectCardCount(project.number);
}
