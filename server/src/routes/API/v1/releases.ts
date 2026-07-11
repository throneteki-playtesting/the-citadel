import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IProject, IProjectRelease } from "common/models/projects";
import { ReleaseDate } from "common/models/shared";
import { getReleaseOffset, Regex } from "common/utils";
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

        if (project.releases.some((r) => r.code === code)) {
            throw new ApiErrorResponse(StatusCodes.CONFLICT, "Already Exists", `Release "${code}" already exists for project #${project.number}`);
        }

        const { principal } = getContext();
        const now = new Date();
        // New releases are always appended to the end of the sequence - reordering happens exclusively via PATCH /reorder
        const nextNumber = project.releases.reduce((max, r) => Math.max(max, r.number), 0) + 1;
        const release: IProjectRelease = {
            ...req.body,
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

        // A capacity change shifts the derived printed numbers of every later release in sequence -
        // reject if any later release has already been published, as that would silently move its printed numbers
        if (req.body.capacity !== existing.capacity) {
            const laterPublished = project.releases.find((r) => r.number > existing.number && !!r.releasedDate);
            if (laterPublished) {
                throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Release", `Cannot change capacity - release "${laterPublished.code}" is already released and its derived numbers would shift`);
            }
        }

        const { principal } = getContext();
        const updatedRelease: IProjectRelease = {
            ...existing,
            ...req.body,
            created: existing.created,
            createdBy: existing.createdBy,
            updated: new Date(),
            updatedBy: principal.id
        };

        let evictedSlots: ISlot[] = [];
        if (updatedRelease.capacity < existing.capacity) {
            const releaseSlots = await dataService.slots.read({ project: project.number, release: { code } });
            const overflow = releaseSlots.filter((slot) => slot.release!.position > updatedRelease.capacity);
            if (overflow.length > 0) {
                evictedSlots = await dataService.slots.update(overflow.map(clearRelease));
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
