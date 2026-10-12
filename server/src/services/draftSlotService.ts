import { StatusCodes } from "http-status-codes";
import { min, omit } from "lodash-es";
import { Faction, factions } from "common/models/cards";
import {
    CUSTOM_TEMPLATE,
    IProject,
    projectTemplateOf,
    SlotCounts,
    templateCounts,
    TemplateSlots
} from "common/models/projects";
import { conditionsBlocker } from "common/models/slotConditions";
import { DefaultSlotStatuses, ISlot, ISlotOptions, matchesTemplate, slotOptionKeys } from "common/models/slots";
import * as Schemas from "common/models/schemas";
import { ApiErrorResponse } from "@/errors";
import { dataService, logger } from "@/services";
import { PREVIEW_NOTICES, withdrawReveal } from "@/discord/forums/cardForum";
import { syncProjectCardCount } from "@/utils";
import { logActivity, projectSnapshot } from "@/services/activityLogService";
import { closeSlotDiscussion, refreshPlanningThreads, slotDiscussionChanged } from "@/discord/forums/planningForum";
import { LogCategory } from "common/models/logs";

/** How many slots each faction should have, what each asks for under a template, and the order they are numbered in */
type SlotRequest = { counts: SlotCounts; options?: TemplateSlots; order?: Faction[] };

// A save which only reorders still has slots to renumber, though there are no counts to meet
export function withSlotOrder(request: SlotRequest | undefined, order?: Faction[]): SlotRequest | undefined {
    return order ? { counts: {}, ...request, order } : request;
}

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

// A project whose slots stray from its template, however they came to, is no longer that template's
export async function settleTemplate(project: IProject) {
    const template = projectTemplateOf(project);
    if (!template?.slots) {
        return project;
    }
    const slots = await dataService.slots.read({ project: project.number });
    if (matchesTemplate(template, slots)) {
        return project;
    }
    const settled = await dataService.projects.update({ ...project, template: CUSTOM_TEMPLATE });
    await logActivity(
        LogCategory.PROJECT,
        "project.updated",
        `<principal> changed <project> to a custom template, as its slots no longer match ${template.name}`,
        { context: { project: projectSnapshot(settled) } }
    );
    return settled;
}

// Opens or removes slots to reach the counts - removing takes a faction's last, whatever they hold - then numbers them
export async function applySlots(project: IProject, { counts, options, order }: SlotRequest) {
    const slots = (await dataService.slots.read({ project: project.number })).sort((a, b) => a.number - b.number);
    const updating: ISlot[] = [];
    const removing: ISlot[] = [];
    const creating: { faction: Faction; options: ISlotOptions }[] = [];

    for (const faction of factions) {
        const target = counts[faction];
        if (target === undefined) {
            continue;
        }
        const own = slots.filter((slot) => slot.faction === faction);
        const kept = own.slice(0, target);
        const asked = options?.[faction];
        const optionsAt = (position: number) => asked?.[position] ?? {};

        if (asked) {
            updating.push(...kept.map((slot, at) => ({ ...omit(slot, slotOptionKeys), ...optionsAt(at) }) as ISlot));
        }
        for (let position = kept.length; position < target; position++) {
            creating.push({ faction, options: optionsAt(position) });
        }
        removing.push(...own.slice(target));
    }

    // A removed slot lets go of its cards, so a suggestion among them is free to be drafted elsewhere
    const released =
        removing.length > 0
            ? await dataService.cards.destroy(
                  removing.map((slot) => ({ project: project.number, number: slot.number })),
                  false
              )
            : [];
    if (removing.length > 0) {
        await dataService.slots.destroy(removing.map((slot) => ({ project: project.number, number: slot.number })));
    }
    if (updating.length > 0) {
        await dataService.slots.update(updating);
    }
    // A removed slot's threads are put away, in the planning forum and the card forum, with what was said in them kept
    await Promise.all(
        removing.map(async (slot) => {
            await closeSlotDiscussion(project, slot);
            if (slot._metadata?.preview) {
                await withdrawReveal(slot._metadata.preview, PREVIEW_NOTICES.slotRemoved).catch((err) =>
                    logger.warn(
                        new Error(`[Discord] Failed to close the preview of slot #${slot.number}`, { cause: err })
                    )
                );
            }
        })
    );
    updating.forEach((slot) => void slotDiscussionChanged(project.number, slot.number));
    if (creating.length > 0) {
        const highest = slots.at(-1)?.number ?? 0;
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

    if (creating.length + removing.length > 0) {
        await logActivity(
            LogCategory.SLOT,
            "slot.counts_updated",
            `<principal> opened ${creating.length} and removed ${removing.length} slots in <project>, releasing ${released.length} cards`,
            { context: { project: projectSnapshot(project) }, severity: removing.length > 0 ? "warn" : undefined }
        );
    }
    if (await renumberSlots(project, order)) {
        refreshPlanningThreads(project);
    }
    return syncProjectCardCount(project.number);
}

// Numbers the slots faction by faction in the order given, or as they already stand - returns whether any changed
export async function renumberSlots(project: IProject, order?: Faction[]) {
    const slots = await dataService.slots.read({ project: project.number });
    const lead = (faction: Faction) => min(slots.filter((slot) => slot.faction === faction).map((slot) => slot.number));
    const sequence = order
        ? [...new Set([...order, ...factions])]
        : [...factions].sort(
              (a, b) => (lead(a) ?? Infinity) - (lead(b) ?? Infinity) || factions.indexOf(a) - factions.indexOf(b)
          );
    const numbers = new Map(
        sequence
            .flatMap((faction) => slots.filter((slot) => slot.faction === faction).sort((a, b) => a.number - b.number))
            .map((slot, at) => [slot.number, at + 1])
    );
    if ([...numbers].every(([from, to]) => from === to)) {
        return false;
    }

    await dataService.cards.renumber(project.number, numbers);
    await dataService.slots.renumber(project.number, numbers);
    await logActivity(
        LogCategory.SLOT,
        "slot.renumbered",
        "<principal> changed the order of the slots in <project>, which renumbered them",
        { context: { project: projectSnapshot(project) } }
    );
    return true;
}
