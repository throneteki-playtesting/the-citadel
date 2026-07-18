import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IProject, IProjectRelease } from "common/models/projects";
import { factions } from "common/models/cards";
import { ReleaseDate } from "common/models/shared";
import { getReleaseCapacity, getReleaseOffset, Regex } from "common/utils";
import { isEqual } from "lodash-es";
import { validateRequest } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { loadProjectByNumber, clearRelease } from "@/utils";
import { ISlot } from "common/models/slots";
import { getContext } from "@/middleware/context";

const router = express.Router({ mergeParams: true });

const CodeParams = {
    number: Joi.number().required(),
    code: Joi.string().required()
};

function assertNotLocked(release: IProjectRelease | undefined, code: string) {
    if (release?.releasedDate) {
        throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Release", `Release "${code}" has already been released and cannot be modified`);
    }
}

function assertNotExpansion(project: IProject, action: string) {
    if (project.type === "expansion") {
        throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", `Expansion projects have a single fixed release which cannot be ${action}`);
    }
}

// Create a new release (pack)
router.post("/",
    validateRequest(Permission.CREATE_RELEASES),
    celebrate({
        [Segments.PARAMS]: { number: Joi.number().required() },
        [Segments.BODY]: Schemas.Release.Draft
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number }, unknown, IProjectRelease, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { code } = req.body;

        assertNotExpansion(project, "added to");

        if (project.releases.some((r) => r.code === code)) {
            throw new ApiErrorResponse(StatusCodes.CONFLICT, "Already Exists", `Release "${code}" already exists for project #${project.number}`);
        }

        const capacity = getReleaseCapacity(req.body.slots);
        if (capacity < 1) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", "A release must have at least one slot");
        }

        const { principal } = getContext();
        const now = new Date();
        // New releases are always appended to the end of the sequence - reordering happens exclusively via PATCH /reorder
        const nextNumber = project.releases.reduce((max, r) => Math.max(max, r.number), 0) + 1;
        const release: IProjectRelease = {
            ...req.body,
            capacity,
            number: nextNumber,
            status: req.body.status ?? "planning",
            created: now,
            createdBy: principal.id,
            updated: now,
            updatedBy: principal.id
        };

        project.releases.push(release);
        const updated = await dataService.projects.update(project);

        res.status(StatusCodes.OK).json(updated);
    })
);

// Reorder the unreleased releases - sequence numbers are reassigned starting after the highest already-released number
router.patch("/reorder",
    validateRequest(Permission.EDIT_RELEASES),
    celebrate({
        [Segments.PARAMS]: { number: Joi.number().required() },
        [Segments.BODY]: Joi.object({ codes: Joi.array().items(Joi.string()).required() })
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number }, unknown, { codes: string[] }, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { codes } = req.body;

        assertNotExpansion(project, "reordered");

        const unreleased = project.releases.filter((r) => !r.releasedDate);
        const unreleasedCodes = new Set(unreleased.map((r) => r.code));
        if (codes.length !== unreleased.length || !codes.every((code) => unreleasedCodes.has(code))) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", "Reorder list must contain exactly the project's unreleased releases");
        }

        const released = project.releases.filter((r) => r.releasedDate);
        const startingNumber = released.reduce((max, r) => Math.max(max, r.number), 0) + 1;

        const { principal } = getContext();
        const now = new Date();
        const renumbered = new Map(codes.map((code, index) => [code, startingNumber + index]));

        project.releases = project.releases.map((r) => renumbered.has(r.code)
            ? { ...r, number: renumbered.get(r.code)!, updated: now, updatedBy: principal.id }
            : r);
        const updated = await dataService.projects.update(project);

        res.status(StatusCodes.OK).json(updated);
    })
);

// Edit a release - fully locked once releasedDate is set
router.put("/:code",
    validateRequest(Permission.EDIT_RELEASES),
    celebrate({
        [Segments.PARAMS]: CodeParams,
        [Segments.BODY]: Schemas.Release.Draft
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number, code: string }, unknown, IProjectRelease, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { code } = req.params;

        const existing = project.releases.find((r) => r.code === code);
        if (!existing) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Release "${code}" does not exist for project #${project.number}`);
        }
        assertNotLocked(existing, code);

        const newCode = req.body.code;
        if (newCode !== code && project.releases.some((r) => r.code === newCode)) {
            throw new ApiErrorResponse(StatusCodes.CONFLICT, "Already Exists", `Release "${newCode}" already exists for project #${project.number}`);
        }

        // An expansion's slot counts are fixed by the project's cards - only the faction order is user-editable
        let slots = req.body.slots;
        if (project.type === "expansion") {
            const ordered = [...new Set([...slots.map((allocation) => allocation.faction), ...factions])];
            slots = ordered
                .map((faction) => ({ faction, count: project.cardCount[faction] }))
                .filter((allocation) => allocation.count > 0);
        }

        const capacity = getReleaseCapacity(slots);
        if (capacity < 1) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", "A release must have at least one slot");
        }

        // A capacity change shifts the derived printed numbers of every later release in sequence -
        // reject if any later release has already been published, as that would silently move its printed numbers
        if (capacity !== existing.capacity) {
            const laterPublished = project.releases.find((r) => r.number > existing.number && !!r.releasedDate);
            if (laterPublished) {
                throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Release", `Cannot change capacity - release "${laterPublished.code}" is already released and its derived numbers would shift`);
            }
        }

        const { principal } = getContext();
        const updatedRelease: IProjectRelease = {
            ...existing,
            ...req.body,
            slots,
            capacity,
            created: existing.created,
            createdBy: existing.createdBy,
            updated: new Date(),
            updatedBy: principal.id
        };

        // A layout change re-places every assigned card under the new position->faction partition:
        // each faction keeps its cards in order up to its new count, and any card that no longer fits
        // (shrunk or removed faction) is evicted back to the development pool. A code change must
        // also be stamped onto every assigned slot, which store the release code by value
        const codeChanged = updatedRelease.code !== code;
        let evictedSlots: ISlot[] = [];
        if (codeChanged || !isEqual(existing.slots, updatedRelease.slots)) {
            const releaseSlots = (await dataService.slots.read({ project: project.number, release: { code } }))
                .sort((a, b) => a.release!.position - b.release!.position);
            const byFaction = new Map<string, ISlot[]>();
            for (const slot of releaseSlots) {
                byFaction.set(slot.faction, [...(byFaction.get(slot.faction) ?? []), slot]);
            }

            const moved: ISlot[] = [];
            const placed = new Set<number>();
            let start = 1;
            for (const { faction, count } of updatedRelease.slots) {
                byFaction.get(faction)?.slice(0, count).forEach((slot, index) => {
                    placed.add(slot.number);
                    const position = start + index;
                    if (slot.release!.position !== position || codeChanged) {
                        moved.push({ ...slot, release: { ...slot.release!, code: updatedRelease.code, position } });
                    }
                });
                start += count;
            }
            const overflow = releaseSlots.filter((slot) => !placed.has(slot.number)).map(clearRelease);

            if (moved.length > 0) {
                await dataService.slots.update(moved);
            }
            if (overflow.length > 0) {
                evictedSlots = await dataService.slots.update(overflow);
            }
        }

        project.releases = project.releases.map((r) => r.code === code ? updatedRelease : r);
        const updated = await dataService.projects.update(project);

        res.status(StatusCodes.OK).json({ project: updated, evictedSlots });
    })
);

// Publish a release - locks it permanently, stamps the release date, and stamps the permanent released number onto every card in it
router.post("/:code/publish",
    validateRequest(Permission.EDIT_RELEASES),
    celebrate({
        [Segments.PARAMS]: CodeParams,
        [Segments.BODY]: { releasedDate: Joi.string().regex(Regex.ReleaseDate).required() }
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number, code: string }, unknown, { releasedDate: ReleaseDate }, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { code } = req.params;
        const { releasedDate } = req.body;

        const release = project.releases.find((r) => r.code === code);
        if (!release) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Release "${code}" does not exist for project #${project.number}`);
        }
        assertNotLocked(release, code);

        // Releases can only be published in sequence order
        const earlierUnreleased = project.releases.find((r) => r.number < release.number && !r.releasedDate);
        if (earlierUnreleased) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Release", `Release "${earlierUnreleased.code}" must be published first - releases can only be published in sequence`);
        }

        const slots = await dataService.slots.read({ project: project.number, release: { code } });
        const filledPositions = new Set(slots.map((slot) => slot.release!.position));
        const missing = Array.from({ length: release.capacity }, (_, i) => i + 1).filter((position) => !filledPositions.has(position));
        if (missing.length > 0) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Release", `Release "${code}" is missing cards for position(s): ${missing.join(", ")}`);
        }

        const { principal } = getContext();
        const now = new Date();

        project.releases = project.releases.map((r) => r.code === code
            ? { ...r, status: "released", releasedDate, updated: now, updatedBy: principal.id }
            : r);
        const updated = await dataService.projects.update(project);

        const offset = getReleaseOffset(updated, code);
        const updatedSlots = slots.map((slot) => ({ ...slot, release: { ...slot.release!, released: true } }));
        await dataService.slots.update(updatedSlots);

        const cards = await dataService.cards.read(slots.map((slot) => ({ project: project.number, number: slot.number, latest: true })));
        const updatedCards = cards.map((card) => ({
            ...card,
            released: { code, number: offset + slots.find((s) => s.number === card.number)!.release!.position }
        }));
        if (updatedCards.length > 0) {
            await dataService.cards.update(updatedCards);
        }

        res.status(StatusCodes.OK).json(updated);
    })
);

// Delete an unpublished release - assigned slots are evicted back to the development pool
router.delete("/:code",
    validateRequest(Permission.DELETE_RELEASES),
    celebrate({ [Segments.PARAMS]: CodeParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number, code: string }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { code } = req.params;

        assertNotExpansion(project, "deleted");

        const release = project.releases.find((r) => r.code === code);
        if (!release) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Data", `Release "${code}" does not exist for project #${project.number}`);
        }
        assertNotLocked(release, code);

        const releaseSlots = await dataService.slots.read({ project: project.number, release: { code } });
        let evictedSlots: ISlot[] = [];
        if (releaseSlots.length > 0) {
            evictedSlots = await dataService.slots.update(releaseSlots.map(clearRelease));
        }

        project.releases = project.releases.filter((r) => r.code !== code);
        const updated = await dataService.projects.update(project);

        res.status(StatusCodes.OK).json({ project: updated, evictedSlots });
    })
);

export default router;
