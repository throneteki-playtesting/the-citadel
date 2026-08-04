import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import {
    checksClosedBy,
    DefaultSlotStatuses,
    DesignStatus,
    designPhase,
    designStatuses,
    IReleaseCheck,
    IReleaseCheckSummary,
    isCheckStale,
    ISlot,
    ReleaseCheckCategory,
    SlotStatuses
} from "common/models/slots";
import { factions } from "common/models/cards";
import { factionNames, getPositionFaction, hasPermission } from "common/utils";
import { IProject } from "common/models/projects";
import { validateRequest } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { loadProjectByNumber, generateGetResponse, applyToFilter, syncProjectCardCount, clearRelease } from "@/utils";
import { IGetRequest, IGetResponse } from "@/types";
import { getRequestSchema } from "@/schemas";
import { isEqual } from "lodash-es";
import { cardSnapshot, logActivity, projectSnapshot } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";
import { getContext } from "@/middleware/context";
import { computeCardProgress } from "@/services/progressService";

const router = express.Router({ mergeParams: true });

const SlotParams = {
    number: Joi.number().required(),
    slot: Joi.number().required()
};

async function getSlots(
    filter: IGetRequest<ISlot>["filter"],
    orderBy: IGetRequest<ISlot>["orderBy"],
    page: IGetRequest<ISlot>["page"],
    perPage: IGetRequest<ISlot>["perPage"]
): Promise<IGetResponse<ISlot>> {
    const [result, count] = await Promise.all([
        dataService.slots.read(filter, orderBy, page, perPage),
        dataService.slots.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(Schemas.Slot.Full, { project: "asc", number: "asc" });

// Read slots for project
router.get(
    "/",
    celebrate({
        [Segments.PARAMS]: { number: Joi.number().required() },
        [Segments.QUERY]: getQuerySchema
    }),
    validateRequest(Permission.READ_SLOTS),
    loadProjectByNumber,
    asyncHandler<{ number: number }, unknown, unknown, IGetRequest<ISlot>>(async (req, res) => {
        const { number: project } = req.params;
        const { filter, orderBy, page, perPage } = req.query;
        const normalizedFilter = applyToFilter(filter, { project });
        const response = await getSlots(normalizedFilter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read single slot
router.get(
    "/:slot",
    celebrate({ [Segments.PARAMS]: SlotParams }),
    validateRequest(Permission.READ_SLOTS),
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const { number: project, slot } = req.params;
        const [result] = await dataService.slots.read({ project, number: slot });
        if (!result) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Invalid Data",
                `Slot #${slot} does not exist for project #${project}`
            );
        }
        res.status(StatusCodes.OK).json(result);
    })
);

// Create a new slot for a faction (draft projects only) - always appended after the current highest slot number
router.post(
    "/",
    validateRequest(Permission.CREATE_SLOTS),
    celebrate({
        [Segments.PARAMS]: { number: Joi.number().required() },
        [Segments.BODY]: {
            faction: Joi.string()
                .required()
                .valid(...factions)
        }
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number }, unknown, { faction: (typeof factions)[number] }, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { faction } = req.body;

        if (!project.draft) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Project",
                "Slots can only be added while a project is in draft"
            );
        }

        const existingSlots = await dataService.slots.read({ project: project.number });
        const nextNumber = existingSlots.reduce((max, slot) => Math.max(max, slot.number), 0) + 1;

        const slot = await dataService.slots.create({
            project: project.number,
            number: nextNumber,
            faction,
            statuses: DefaultSlotStatuses
        } as ISlot);

        await syncProjectCardCount(project.number);

        await logActivity(LogCategory.SLOT, "slot.created", `<principal> created a ${faction} slot in <project>`, {
            context: { project: projectSnapshot(project) }
        });

        res.status(StatusCodes.OK).json(slot);
    })
);

// Delete an empty slot (draft projects only) - must be the highest-numbered slot within its own faction
router.delete(
    "/:slot",
    validateRequest(Permission.DELETE_SLOTS),
    celebrate({ [Segments.PARAMS]: SlotParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;

        if (!project.draft) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Project",
                "Slots can only be removed while a project is in draft"
            );
        }

        const [slot] = await dataService.slots.read({ project: project.number, number: slotNumber });
        if (!slot) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Invalid Data",
                `Slot #${slotNumber} does not exist for project #${project.number}`
            );
        }

        const factionSlots = await dataService.slots.read({ project: project.number, faction: slot.faction });
        const highestForFaction = Math.max(...factionSlots.map((s) => s.number));
        if (slotNumber !== highestForFaction) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Slot",
                "Only the last slot in a faction can be removed"
            );
        }

        const cardCount = await dataService.cards.count({ project: project.number, number: slotNumber });
        if (cardCount > 0) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Slot",
                "Cannot remove a slot which has cards assigned to it"
            );
        }

        const [deleted] = await dataService.slots.destroy({ project: project.number, number: slotNumber });

        await syncProjectCardCount(project.number);

        await logActivity(LogCategory.SLOT, "slot.deleted", `<principal> deleted slot ${slotNumber} from <project>`, {
            context: { project: projectSnapshot(project) },
            severity: "warn"
        });

        res.status(StatusCodes.OK).json(deleted);
    })
);

// Edit slot status/type/notes
router.patch(
    "/:slot",
    validateRequest(Permission.EDIT_SLOTS),
    celebrate({
        [Segments.PARAMS]: SlotParams,
        [Segments.BODY]: Schemas.Slot.Partial
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, Partial<ISlot>, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;
        const { type, notes, statuses } = req.body;

        const [slot] = await dataService.slots.read({ project: project.number, number: slotNumber });
        if (!slot) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Invalid Data",
                `Slot #${slotNumber} does not exist for project #${project.number}`
            );
        }

        // Preventing changes which require specific endpoints & conditions to handle them
        if (statuses?.design?.checks !== undefined && !isEqual(statuses.design.checks, slot.statuses.design.checks)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Release checks cannot be submitted this way"
            );
        }
        if (
            statuses?.design?.finalApproval !== undefined &&
            !isEqual(statuses.design.finalApproval, slot.statuses.design.finalApproval)
        ) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Final approval cannot be submitted this way"
            );
        }
        if (
            statuses?.design?.status &&
            designPhase[statuses.design.status] !== designPhase[slot.statuses.design.status]
        ) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "This sort of status change cannot be submitted this way"
            );
        }

        const mergedStatuses: SlotStatuses | undefined = statuses && {
            ...slot.statuses,
            ...statuses,
            ...(statuses.design && { design: { ...slot.statuses.design, ...statuses.design } }),
            ...(statuses.artwork && { artwork: { ...slot.statuses.artwork, ...statuses.artwork } })
        };

        // Production is downstream of design & artwork, and the invariant breaks from both directions
        if (
            mergedStatuses &&
            mergedStatuses.production !== "waiting" &&
            !(mergedStatuses.design.status === "complete" && mergedStatuses.artwork.status === "complete")
        ) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                mergedStatuses.production !== slot.statuses.production
                    ? "Production can only begin once design and artwork are both complete"
                    : "Design and artwork are locked while production is underway - revert production to Waiting before changing them"
            );
        }

        const updated = await dataService.slots.update({
            ...slot,
            ...(type !== undefined && { type }),
            ...(notes !== undefined && { notes }),
            ...(mergedStatuses && { statuses: mergedStatuses })
        });

        await logActivity(LogCategory.SLOT, "slot.updated", `<principal> updated slot ${slotNumber} in <project>`, {
            context: { project: projectSnapshot(project) }
        });

        res.status(StatusCodes.OK).json(updated);
    })
);

// Move (or emergency-reverse) a card's design between the development & finalising phases - the only
// path allowed to move design.status across phases, and the only path allowed to set/clear finalApproval
router.patch(
    "/:slot/design/status",
    validateRequest(Permission.APPROVE_CARD_DESIGN),
    celebrate({
        [Segments.PARAMS]: SlotParams,
        [Segments.BODY]: {
            status: Joi.string()
                .required()
                .valid(...designStatuses)
        }
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, { status: DesignStatus }, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;
        const { status } = req.body;

        const [slot] = await dataService.slots.read({ project: project.number, number: slotNumber });
        if (!slot) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Invalid Data",
                `Slot #${slotNumber} does not exist for project #${project.number}`
            );
        }

        const currentPhase = designPhase[slot.statuses.design.status];
        const targetPhase = designPhase[status];
        if (currentPhase === targetPhase) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Design is already at this stage of approval - this sort of status change cannot be submitted this way"
            );
        }

        const isFinalising = currentPhase === "development" && targetPhase === "finalising";

        // Same invariant PATCH /:slot enforces - reopening design would strand an already-composited card file
        if (!isFinalising && slot.statuses.production !== "waiting") {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Design cannot be reopened while production is underway - revert production to Waiting first"
            );
        }

        const { principal } = getContext();
        const updated = await dataService.slots.update({
            ...slot,
            statuses: {
                ...slot.statuses,
                design: {
                    ...slot.statuses.design,
                    status,
                    finalApproval: isFinalising ? { by: principal.id, at: new Date() } : undefined
                }
            }
        });

        // Locking a design in (or reopening it) adds or removes the card from the announcement's list
        if (slot.release) {
            await dataService.projects.sync(project, true);
        }

        const [card] = await dataService.cards.read({ project: project.number, number: slotNumber, latest: true });
        await logActivity(
            LogCategory.SLOT,
            isFinalising ? "slot.design_approved" : "slot.design_regressed",
            isFinalising
                ? "<principal> locked in <card>'s design, marking it for the refinement teams"
                : `<principal> reopened design on <card>, regressing it from ${slot.statuses.design.status} back to ${status}`,
            {
                context: {
                    project: projectSnapshot(project),
                    card: cardSnapshot(`${project.number}|${slotNumber}|latest`, card)
                },
                severity: isFinalising ? undefined : "warn"
            }
        );

        res.status(StatusCodes.OK).json(updated);
    })
);

// Submit (or update) the caller's own release check - upserted by submitter, one live entry per person
router.patch(
    "/:slot/design/checks",
    validateRequest(Permission.SUBMIT_RELEASE_CHECK),
    celebrate({
        [Segments.PARAMS]: SlotParams,
        [Segments.BODY]: Schemas.Slot.ReleaseCheck
    }),
    loadProjectByNumber,
    asyncHandler<
        { number: number; slot: number },
        unknown,
        { ready: boolean; categories?: ReleaseCheckCategory[]; note?: string },
        unknown
    >(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;
        const { ready, categories, note } = req.body;

        const [slot] = await dataService.slots.read({ project: project.number, number: slotNumber });
        if (!slot) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Invalid Data",
                `Slot #${slotNumber} does not exist for project #${project.number}`
            );
        }

        const release = project.releases.find((entry) => entry.code === slot.release?.code);
        const closedBy = checksClosedBy(slot.statuses.design.status, release?.status);
        if (closedBy) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                closedBy === "design"
                    ? "This card's design has been locked in, so its release checks are closed"
                    : "This card's release has been approved, so its release checks are closed"
            );
        }

        const [latestCard] = await dataService.cards.read({
            project: project.number,
            number: slotNumber,
            latest: true
        });
        if (!latestCard) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Slot #${slotNumber} does not have a card to check yet`
            );
        }

        const { principal } = getContext();
        const now = new Date();
        const existingIndex = slot.statuses.design.checks.findIndex((entry) => entry.createdBy === principal.id);
        const exists = existingIndex >= 0;
        const entry: IReleaseCheck = !exists
            ? {
                  ready,
                  categories,
                  note,
                  version: latestCard.version,
                  created: now,
                  createdBy: principal.id,
                  updated: now,
                  updatedBy: principal.id
              }
            : {
                  ...slot.statuses.design.checks[existingIndex],
                  ready,
                  // Only sent alongside a "not ready" verdict, so withdrawing one keeps the reasoning it
                  // was given rather than erasing the record of why it was ever raised
                  ...(categories !== undefined && { categories }),
                  ...(note !== undefined && { note }),
                  version: latestCard.version,
                  updated: now,
                  updatedBy: principal.id
              };

        const checks = !exists
            ? [...slot.statuses.design.checks, entry]
            : slot.statuses.design.checks.map((existing, index) => (index === existingIndex ? entry : existing));

        const updated = await dataService.slots.update({
            ...slot,
            statuses: { ...slot.statuses, design: { ...slot.statuses.design, checks } }
        });

        // Checks don't touch the release itself, so the announcement has to be told to recount
        if (slot.release) {
            await dataService.projects.sync(project, true);
        }

        await logActivity(
            LogCategory.SLOT,
            "slot.release_check",
            `<principal> has ${exists ? "updated" : "provided"} their release check for <card>, marking it as ${entry.ready ? "ready" : "not ready"}`,
            {
                context: {
                    check: entry,
                    card: cardSnapshot(`${latestCard.project}|${latestCard.number}|${latestCard.version}`, latestCard)
                },
                severity: "info"
            }
        );

        res.status(StatusCodes.OK).json(updated);
    })
);

// Release-check tally for a slot, measured against everyone able to submit one
router.get(
    "/:slot/design/checks/summary",
    validateRequest(Permission.READ_RELEASE_CHECKS),
    celebrate({ [Segments.PARAMS]: SlotParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const { number: project, slot: slotNumber } = req.params;

        const [slot] = await dataService.slots.read({ project, number: slotNumber });
        if (!slot) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Invalid Data",
                `Slot #${slotNumber} does not exist for project #${project}`
            );
        }

        const [total, [latestCard]] = await Promise.all([
            dataService.users.countByPermission(Permission.SUBMIT_RELEASE_CHECK),
            dataService.cards.read({ project, number: slotNumber, latest: true })
        ]);

        // Only verdicts against the latest version count; the rest are reported as a subset of pending
        const { checks } = slot.statuses.design;
        const current = checks.filter((entry) => !isCheckStale(entry, latestCard?.version));
        const ready = current.filter((entry) => entry.ready).length;
        const notReady = current.length - ready;

        // Deliberately scoped to the latest version - a review of an earlier card says nothing about this one.
        // Named answers are review data, so they're only read for someone allowed to read reviews at all
        const canReadReviews = hasPermission(getContext().principal, Permission.READ_REVIEWS);
        const reviews =
            latestCard && canReadReviews
                ? await dataService.reviews.read({ project, number: slotNumber, version: latestCard.version })
                : [];

        const summary: IReleaseCheckSummary = {
            version: latestCard?.version,
            ready,
            notReady,
            // Clamped, since a submitter can lose the permission after answering
            pending: Math.max(0, total - current.length),
            stale: checks.length - current.length,
            total,
            releasable: reviews.map((review) => ({ reviewer: review.reviewer, answer: review.statements.releasable }))
        };

        res.status(StatusCodes.OK).json(summary);
    })
);

// Computed card-completeness progress for a slot
router.get(
    "/:slot/progress",
    validateRequest(Permission.READ_STATS_SLOT),
    celebrate({ [Segments.PARAMS]: SlotParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const { number: project, slot: slotNumber } = req.params;
        const progress = await computeCardProgress(project, slotNumber);
        res.status(StatusCodes.OK).json(progress);
    })
);

// Assign or clear a slot's release placement
router.patch(
    "/:slot/release",
    validateRequest([Permission.EDIT_SLOTS, Permission.EDIT_RELEASES]),
    celebrate({
        [Segments.PARAMS]: SlotParams,
        [Segments.BODY]: Joi.object({
            code: Joi.string().required().allow(null),
            position: Joi.number().when("code", {
                is: Joi.valid(null),
                then: Joi.forbidden(),
                otherwise: Joi.required()
            })
        })
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, { code: string | null; position?: number }, unknown>(
        async (req, res) => {
            const project = res.locals.project as IProject;
            const { slot: slotNumber } = req.params;
            const { code, position } = req.body;

            const [slot] = await dataService.slots.read({ project: project.number, number: slotNumber });
            if (!slot) {
                throw new ApiErrorResponse(
                    StatusCodes.NOT_FOUND,
                    "Invalid Data",
                    `Slot #${slotNumber} does not exist for project #${project.number}`
                );
            }

            if (slot.release?.released) {
                throw new ApiErrorResponse(
                    StatusCodes.NOT_ACCEPTABLE,
                    "Invalid Release",
                    `Release "${slot.release.code}" has already been released and cannot be modified`
                );
            }

            const updates: ISlot[] = [];
            let occupant: ISlot | undefined;

            if (code === null) {
                if (project.type === "expansion") {
                    throw new ApiErrorResponse(
                        StatusCodes.NOT_ACCEPTABLE,
                        "Invalid Project",
                        "Expansion cards cannot be removed from the release - expansions have no development pool"
                    );
                }
                updates.push(clearRelease(slot));
            } else {
                const targetRelease = project.releases.find((r) => r.code === code);
                if (!targetRelease) {
                    throw new ApiErrorResponse(
                        StatusCodes.BAD_REQUEST,
                        "Invalid Data",
                        `Release "${code}" does not exist for project #${project.number}`
                    );
                }
                if (targetRelease.releasedDate) {
                    throw new ApiErrorResponse(
                        StatusCodes.NOT_ACCEPTABLE,
                        "Invalid Release",
                        `Release "${code}" has already been released and cannot be modified`
                    );
                }
                if (position < 1 || position > targetRelease.capacity) {
                    throw new ApiErrorResponse(
                        StatusCodes.BAD_REQUEST,
                        "Invalid Data",
                        `Position must be between 1 and ${targetRelease.capacity} for release "${code}"`
                    );
                }
                const positionFaction = getPositionFaction(targetRelease.slots, position);
                if (positionFaction && positionFaction !== slot.faction) {
                    throw new ApiErrorResponse(
                        StatusCodes.BAD_REQUEST,
                        "Invalid Data",
                        `Position ${position} of release "${code}" is reserved for ${factionNames[positionFaction]} cards`
                    );
                }

                // If another slot already occupies this position, either swap it into the dragged slot's
                // previous release position (if it had one), or evict it back to the development pool
                const occupyingSlots = await dataService.slots.read({ project: project.number, release: { code } });
                occupant = occupyingSlots.find((s) => s.release?.position === position && s.number !== slotNumber);
                if (occupant) {
                    if (slot.release) {
                        updates.push({ ...occupant, release: slot.release });
                    } else {
                        updates.push(clearRelease(occupant));
                    }
                }

                updates.push({ ...slot, release: { code, position } });
            }

            const updated = await dataService.slots.update(updates);
            const primary = updated.find((s) => s.number === slotNumber);
            const evicted = updated.find((s) => s.number !== slotNumber);

            const [primaryCard] = await dataService.cards.read({
                project: project.number,
                number: slotNumber,
                latest: true
            });
            const primarySnapshot = cardSnapshot(`${project.number}|${slotNumber}|latest`, primaryCard);

            if (code === null) {
                if (slot.release) {
                    await logActivity(
                        LogCategory.SLOT,
                        "slot.release_cleared",
                        `<principal> returned <card> to development from slot ${slot.release.position} of ${slot.release.code}`,
                        { context: { card: primarySnapshot } }
                    );
                }
            } else if (slot.release) {
                await logActivity(
                    LogCategory.SLOT,
                    "slot.release_moved",
                    `<principal> moved <card> from slot ${slot.release.position} of ${slot.release.code} to slot ${position} of ${code}`,
                    { context: { card: primarySnapshot } }
                );
            } else {
                await logActivity(
                    LogCategory.SLOT,
                    "slot.release_assigned",
                    `<principal> placed <card> into slot ${position} of ${code}`,
                    { context: { card: primarySnapshot } }
                );
            }

            if (occupant) {
                const [occupantCard] = await dataService.cards.read({
                    project: project.number,
                    number: occupant.number,
                    latest: true
                });
                const occupantSnapshot = cardSnapshot(`${project.number}|${occupant.number}|latest`, occupantCard);

                if (slot.release) {
                    await logActivity(
                        LogCategory.SLOT,
                        "slot.release_displaced",
                        `<principal>'s placement moved <card> from slot ${position} of ${code} to slot ${slot.release.position} of ${slot.release.code}`,
                        { context: { card: occupantSnapshot }, severity: "warn" }
                    );
                } else {
                    await logActivity(
                        LogCategory.SLOT,
                        "slot.release_evicted",
                        `<principal>'s placement evicted <card> from slot ${position} of ${code}`,
                        { context: { card: occupantSnapshot }, severity: "warn" }
                    );
                }
            }

            res.status(StatusCodes.OK).json({ slot: primary, evictedSlot: evicted });
        }
    )
);

export default router;
