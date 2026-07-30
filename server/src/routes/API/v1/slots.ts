import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { DefaultSlotStatuses, ISlot } from "common/models/slots";
import { factions } from "common/models/cards";
import { factionNames, getPositionFaction } from "common/utils";
import { IProject } from "common/models/projects";
import { validateRequest } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { loadProjectByNumber, generateGetResponse, applyToFilter, syncProjectCardCount, clearRelease } from "@/utils";
import { IGetRequest, IGetResponse } from "@/types";
import { getRequestSchema } from "@/schemas";
import { cardSnapshot, logActivity, projectSnapshot } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";

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

        const updated = await dataService.slots.update({
            ...slot,
            ...(type !== undefined && { type }),
            ...(notes !== undefined && { notes }),
            ...(statuses && { statuses: { ...slot.statuses, ...statuses } })
        });

        await logActivity(LogCategory.SLOT, "slot.updated", `<principal> updated slot ${slotNumber} in <project>`, {
            context: { project: projectSnapshot(project) }
        });

        res.status(StatusCodes.OK).json(updated);
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
