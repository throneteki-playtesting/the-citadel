import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService, logger } from "@/services";
import * as Schemas from "common/models/schemas";
import { SchemaType } from "common/models/schemas";
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
    ISlotArtwork,
    ISlotArtworkDetail,
    ISlotRefinement,
    ISlotRefinementDetail,
    ReleaseCheckCategory,
    resolveFinalCard,
    SlotStatuses
} from "common/models/slots";
import { artworkBlocker, IArtworkProgress } from "common/models/artwork";
import {
    InquirySeverity,
    IRefinementCheck,
    IRefinementInquiry,
    isInquiryAddressed,
    isInquiryOpen,
    refinementBlocker
} from "common/models/refinement";
import { factions, IPlaytestCard } from "common/models/cards";
import { SemanticVersion } from "common/utils";
import { factionNames, getPositionFaction, hasPermission } from "common/utils";
import { areReleaseChecksClosed, IProject } from "common/models/projects";
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
import {
    closeInquiryDiscussion,
    endInquiryDiscussion,
    reopenInquiryDiscussion,
    startInquiryDiscussion
} from "@/discord/forums/refinementForum";

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

// Artwork is frozen once a card file exists downstream of it - see PATCH /:slot/artwork
function toArtworkDetail(slot: ISlot): ISlotArtworkDetail {
    return {
        artwork: slot.statuses.artwork,
        isLockedByProduction: slot.statuses.production !== "waiting"
    };
}

function toArtworkRow(slot: ISlot): ISlotArtwork {
    return {
        project: slot.project,
        number: slot.number,
        faction: slot.faction,
        release: slot.release,
        ...toArtworkDetail(slot)
    };
}

async function requireSlot(project: number, number: number): Promise<ISlot> {
    const [slot] = await dataService.slots.read({ project, number });
    if (!slot) {
        throw new ApiErrorResponse(
            StatusCodes.NOT_FOUND,
            "Invalid Data",
            `Slot #${number} does not exist for project #${project}`
        );
    }
    return slot;
}

function requireInquiry(slot: ISlot, inquiry: number): IRefinementInquiry {
    const entry = slot.statuses.design.inquiries.find((existing) => existing.inquiry === inquiry);
    if (!entry) {
        throw new ApiErrorResponse(
            StatusCodes.NOT_FOUND,
            "Invalid Data",
            `Inquiry #${inquiry} does not exist for slot #${slot.number}`
        );
    }
    return entry;
}

// The card refinement answers for - a release-bound draft where the slot has one, otherwise the latest.
// Everything's staleness is measured against it, so it travels with every refinement response
function finalVersionFor(
    project: IProject,
    slot: ISlot,
    latest?: IPlaytestCard,
    draft?: IPlaytestCard
): SemanticVersion | undefined {
    const release = project.releases.find((entry) => entry.code === slot.release?.code);
    return resolveFinalCard(slot.statuses.design.status, release?.status, draft, latest)?.version;
}

async function readFinalVersion(project: IProject, slot: ISlot) {
    const [[latest], [draft]] = await Promise.all([
        dataService.cards.read({ project: slot.project, number: slot.number, latest: true }),
        dataService.cards.read({ project: slot.project, number: slot.number, draft: true })
    ]);
    return finalVersionFor(project, slot, latest, draft);
}

/**
 * Validates a body against a schema the route could not know until it had loaded something - celebrate
 * runs before the handler, so a rule depending on stored state has to be applied here instead.
 */
function validateBody<T>(schema: SchemaType, body: unknown): T {
    const { error, value } = schema.validate(body, { errors: { label: false } });
    if (error) {
        throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", error.message);
    }
    return value as T;
}

function canReadFaq() {
    return hasPermission(getContext().principal, Permission.READ_FAQ);
}

function toRefinementDetail(slot: ISlot, version?: SemanticVersion, withFaq = false): ISlotRefinementDetail {
    return {
        designStatus: slot.statuses.design.status,
        inquiries: slot.statuses.design.inquiries,
        refinementChecks: slot.statuses.design.checks.refinement,
        ...(withFaq && { faq: slot.faq }),
        version
    };
}

function toRefinementRow(slot: ISlot, version?: SemanticVersion, withFaq = false): ISlotRefinement {
    return {
        project: slot.project,
        number: slot.number,
        faction: slot.faction,
        release: slot.release,
        ...toRefinementDetail(slot, version, withFaq)
    };
}

async function saveInquiries(slot: ISlot, inquiries: IRefinementInquiry[]) {
    return await dataService.slots.update({
        ...slot,
        statuses: { ...slot.statuses, design: { ...slot.statuses.design, inquiries } }
    });
}

function withInquiry(slot: ISlot, updated: IRefinementInquiry) {
    return slot.statuses.design.inquiries.map((entry) => (entry.inquiry === updated.inquiry ? updated : entry));
}

async function saveRefinementChecks(slot: ISlot, refinement: IRefinementCheck[]) {
    return await dataService.slots.update({
        ...slot,
        statuses: {
            ...slot.statuses,
            design: { ...slot.statuses.design, checks: { ...slot.statuses.design.checks, refinement } }
        }
    });
}

// Upserts one person's check against a version, returning the list unchanged when theirs already stands
// for it - so raising an inquiry can record a check without pointlessly rewriting the slot
function withRefinementCheck(checks: IRefinementCheck[], by: string, version: SemanticVersion, at: Date) {
    const existing = checks.find((entry) => entry.createdBy === by);
    if (existing?.version === version) {
        return checks;
    }

    const entry: IRefinementCheck = {
        version,
        created: existing?.created ?? at,
        createdBy: by,
        updated: at,
        updatedBy: by
    };
    return existing ? checks.map((check) => (check.createdBy === by ? entry : check)) : [...checks, entry];
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

// Read every slot's artwork lane for a project - the project's Artworks list, decoupled from READ_SLOTS.
// Registered ahead of GET /:slot so "artworks" isn't swallowed as a (non-numeric, so rejected) :slot value.
router.get(
    "/artworks",
    celebrate({
        [Segments.PARAMS]: { number: Joi.number().required() },
        [Segments.QUERY]: getQuerySchema
    }),
    validateRequest(Permission.READ_ARTWORKS),
    loadProjectByNumber,
    asyncHandler<{ number: number }, unknown, unknown, IGetRequest<ISlot>>(async (req, res) => {
        const { number: project } = req.params;
        const { filter, orderBy, page, perPage } = req.query;
        const normalizedFilter = applyToFilter(filter, { project });
        const response = await getSlots(normalizedFilter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json({ ...response, items: response.items.map(toArtworkRow) });
    })
);

// Read the refinement view of every slot in a project, gated by READ_REFINEMENT rather than READ_SLOTS
router.get(
    "/refinements",
    celebrate({
        [Segments.PARAMS]: { number: Joi.number().required() },
        [Segments.QUERY]: getQuerySchema
    }),
    validateRequest(Permission.READ_REFINEMENT),
    loadProjectByNumber,
    asyncHandler<{ number: number }, unknown, unknown, IGetRequest<ISlot>>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { filter, orderBy, page, perPage } = req.query;
        const normalizedFilter = applyToFilter(filter, { project: project.number });
        const response = await getSlots(normalizedFilter, orderBy, page, perPage);

        // Two reads for the whole page rather than a pair per row - every row needs a version to measure
        // its inquiries and checks against
        const [latest, drafts] = await Promise.all([
            dataService.cards.read({ project: project.number, latest: true }),
            dataService.cards.read({ project: project.number, draft: true })
        ]);
        const latestByNumber = new Map(latest.map((card) => [card.number, card]));
        const draftsByNumber = new Map(drafts.map((card) => [card.number, card]));

        // FAQ notes ride the row so the list can mark which cards have them, gated the same as anywhere else
        const withFaq = canReadFaq();
        res.status(StatusCodes.OK).json({
            ...response,
            items: response.items.map((slot) =>
                toRefinementRow(
                    slot,
                    finalVersionFor(project, slot, latestByNumber.get(slot.number), draftsByNumber.get(slot.number)),
                    withFaq
                )
            )
        });
    })
);

// Read single slot
router.get(
    "/:slot",
    celebrate({ [Segments.PARAMS]: SlotParams }),
    validateRequest(Permission.READ_SLOTS),
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const { number: project, slot } = req.params;
        const result = await requireSlot(project, slot);
        res.status(StatusCodes.OK).json(result);
    })
);

// Read a single slot's artwork lane alone, gated by READ_ARTWORKS rather than READ_SLOTS
router.get(
    "/:slot/artwork",
    celebrate({ [Segments.PARAMS]: SlotParams }),
    validateRequest(Permission.READ_ARTWORKS),
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const { number: project, slot } = req.params;
        const result = await requireSlot(project, slot);
        res.status(StatusCodes.OK).json(toArtworkDetail(result));
    })
);

// Read a single slot's refinement view alone, gated by READ_REFINEMENT rather than READ_SLOTS
router.get(
    "/:slot/refinement",
    celebrate({ [Segments.PARAMS]: SlotParams }),
    validateRequest(Permission.READ_REFINEMENT),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const slot = await requireSlot(project.number, req.params.slot);
        const version = await readFinalVersion(project, slot);
        res.status(StatusCodes.OK).json(toRefinementDetail(slot, version, canReadFaq()));
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

        const slot = await requireSlot(project.number, slotNumber);

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
        const { type, notes, faq, statuses } = req.body;

        const slot = await requireSlot(project.number, slotNumber);

        // Preventing changes which require specific endpoints & conditions to handle them
        if (statuses?.design?.checks !== undefined && !isEqual(statuses.design.checks, slot.statuses.design.checks)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Design checks cannot be submitted this way"
            );
        }
        if (
            statuses?.design?.inquiries !== undefined &&
            !isEqual(statuses.design.inquiries, slot.statuses.design.inquiries)
        ) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Refinement inquiries cannot be submitted this way"
            );
        }
        if (faq !== undefined && !isEqual(faq, slot.faq)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "FAQ notes cannot be submitted this way"
            );
        }

        // Completing a design is the claim that refinement is finished, so it answers to the same checklist
        // the tab shows. Read only on the transition - every other slot edit is untouched by it
        const enteringComplete = statuses?.design?.status === "complete" && slot.statuses.design.status !== "complete";
        if (enteringComplete) {
            const blocker = refinementBlocker(
                slot.statuses.design.inquiries,
                slot.statuses.design.checks.refinement,
                await readFinalVersion(project, slot)
            );
            if (blocker) {
                if (!hasPermission(getContext().principal, Permission.APPROVE_CARD_DESIGN)) {
                    throw new ApiErrorResponse(
                        StatusCodes.NOT_ACCEPTABLE,
                        "Invalid Data",
                        `Design cannot be completed yet - ${blocker}`
                    );
                }
                // The override is allowed, but never silent
                await logActivity(
                    LogCategory.SLOT,
                    "slot.refinement_overridden",
                    `<principal> completed the design of slot ${slotNumber} in <project> with refinement outstanding: ${blocker}`,
                    { context: { project: projectSnapshot(project) }, severity: "warn" }
                );
            }
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
        // The artwork lane has its own endpoint & permission - see PATCH /:slot/artwork
        if (statuses?.artwork !== undefined) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Artwork cannot be updated this way"
            );
        }

        const mergedStatuses: SlotStatuses | undefined = statuses && {
            ...slot.statuses,
            ...statuses,
            ...(statuses.design && { design: { ...slot.statuses.design, ...statuses.design } })
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

// Edit a slot's artwork lane alone, gated by EDIT_ARTWORKS rather than EDIT_SLOTS - see PATCH /:slot
router.patch(
    "/:slot/artwork",
    validateRequest(Permission.EDIT_ARTWORKS),
    celebrate({
        [Segments.PARAMS]: SlotParams,
        [Segments.BODY]: Schemas.Slot.ArtworkProgress
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, Partial<IArtworkProgress>, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;
        const artworkUpdate = req.body;

        const slot = await requireSlot(project.number, slotNumber);

        // Mirrors the generic PATCH /:slot invariant - a card file downstream of this can't be reopened
        if (slot.statuses.production !== "waiting") {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Artwork is locked while production is underway - revert production to Waiting before changing it"
            );
        }

        const mergedArtwork: IArtworkProgress = { ...slot.statuses.artwork, ...artworkUpdate };

        // Only the move is refused, so a record already at an unsupported status stays editable to repair
        if (mergedArtwork.status !== slot.statuses.artwork.status) {
            const artists = await dataService.artists.read();
            const blocker = artworkBlocker(mergedArtwork, mergedArtwork.status, artists);
            if (blocker) {
                throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Data", blocker);
            }
        }

        const updated = await dataService.slots.update({
            ...slot,
            statuses: { ...slot.statuses, artwork: mergedArtwork }
        });

        await logActivity(
            LogCategory.SLOT,
            "slot.updated",
            `<principal> updated the artwork for slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) } }
        );

        res.status(StatusCodes.OK).json(toArtworkDetail(updated));
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

        const slot = await requireSlot(project.number, slotNumber);

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

        const slot = await requireSlot(project.number, slotNumber);

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
        const existingIndex = slot.statuses.design.checks.release.findIndex(
            (entry) => entry.createdBy === principal.id
        );
        const exists = existingIndex >= 0;

        // A verdict on a newer version stands on its own, abandoning the message and reasoning the last
        // one left against a card which has since changed
        const previous = exists ? slot.statuses.design.checks.release[existingIndex] : undefined;
        if (previous && isCheckStale(previous, latestCard.version)) {
            delete previous._metadata;
            delete previous.categories;
            delete previous.note;
        }

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
                  ...previous,
                  ready,
                  // Only sent alongside a "not ready" verdict, so withdrawing one keeps the reasoning it
                  // was given rather than erasing the record of why it was ever raised
                  ...(categories !== undefined && { categories }),
                  ...(note !== undefined && { note }),
                  version: latestCard.version,
                  updated: now,
                  updatedBy: principal.id
              };

        const releaseChecks = !exists
            ? [...slot.statuses.design.checks.release, entry]
            : slot.statuses.design.checks.release.map((existing, index) =>
                  index === existingIndex ? entry : existing
              );

        const updated = await dataService.slots.update({
            ...slot,
            statuses: {
                ...slot.statuses,
                design: {
                    ...slot.statuses.design,
                    checks: { ...slot.statuses.design.checks, release: releaseChecks }
                }
            }
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

        const slot = await requireSlot(project, slotNumber);

        const [total, [latestCard]] = await Promise.all([
            dataService.users.countByPermission(Permission.SUBMIT_RELEASE_CHECK),
            dataService.cards.read({ project, number: slotNumber, latest: true })
        ]);

        // Only verdicts against the latest version count; the rest are reported as a subset of pending
        const checks = slot.statuses.design.checks.release;
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

const InquiryParams = { ...SlotParams, inquiry: Joi.number().required() };

// Raise an inquiry against a card. Allowed at any design step - refinement usually starts once a card
// reaches the refinement step, but nothing is gained by refusing somebody who spotted it earlier
router.post(
    "/:slot/inquiries",
    validateRequest(Permission.RAISE_INQUIRIES),
    celebrate({ [Segments.PARAMS]: SlotParams, [Segments.BODY]: Schemas.Slot.Inquiry }),
    loadProjectByNumber,
    asyncHandler<
        { number: number; slot: number },
        unknown,
        { severity: InquirySeverity; summary: string; detail?: string },
        unknown
    >(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;
        const { severity, summary, detail } = req.body;

        const slot = await requireSlot(project.number, slotNumber);
        const version = await readFinalVersion(project, slot);
        if (!version) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Slot #${slotNumber} does not have a card to raise an inquiry against yet`
            );
        }

        const { principal } = getContext();
        const now = new Date();
        const updated = await dataService.slots.appendInquiry(
            { project: project.number, number: slotNumber },
            (inquiry) => ({
                inquiry,
                version,
                severity,
                status: "open",
                summary,
                ...(detail && { detail }),
                created: now,
                createdBy: principal.id,
                updated: now,
                updatedBy: principal.id
            })
        );
        if (!updated) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Invalid Data",
                `Slot #${slotNumber} does not exist for project #${project.number}`
            );
        }

        // Raising an inquiry says you have read the card, so it counts as a check without asking twice
        const refinement = withRefinementCheck(updated.statuses.design.checks.refinement, principal.id, version, now);
        const checked =
            refinement === updated.statuses.design.checks.refinement
                ? updated
                : await saveRefinementChecks(updated, refinement);

        await logActivity(
            LogCategory.SLOT,
            "slot.inquiry_raised",
            `<principal> raised a refinement inquiry on slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) } }
        );

        res.status(StatusCodes.OK).json(toRefinementDetail(checked, version, canReadFaq()));
    })
);

// Edit an inquiry's own wording. Severity changes in place rather than by closing and re-raising, so
// research which turns up a real problem keeps whatever discussion it already gathered
router.put(
    "/:slot/inquiries/:inquiry",
    validateRequest(
        (principal) =>
            hasPermission(principal, Permission.EDIT_INQUIRIES) || hasPermission(principal, Permission.RAISE_INQUIRIES)
    ),
    celebrate({ [Segments.PARAMS]: InquiryParams, [Segments.BODY]: Schemas.Slot.Inquiry }),
    loadProjectByNumber,
    asyncHandler<
        { number: number; slot: number; inquiry: number },
        unknown,
        { severity: InquirySeverity; summary: string; detail?: string },
        unknown
    >(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber, inquiry: inquiryNumber } = req.params;
        const { severity, summary, detail } = req.body;

        const slot = await requireSlot(project.number, slotNumber);
        const entry = requireInquiry(slot, inquiryNumber);

        const { principal } = getContext();
        if (entry.createdBy !== principal.id && !hasPermission(principal, Permission.EDIT_INQUIRIES)) {
            throw new ApiErrorResponse(
                StatusCodes.FORBIDDEN,
                "Forbidden",
                "Only the person who raised this inquiry can edit it"
            );
        }
        // Rewording an inquiry after the event would leave a resolution answering something nobody raised
        if (!isInquiryOpen(entry)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Inquiry #${inquiryNumber} must be reopened before it can be edited`
            );
        }

        // Re-stamped against the card as it stands: rewording an inquiry means reading it against the
        // current card, which is exactly what the stale marker asks for
        const version = await readFinalVersion(project, slot);
        const edited: IRefinementInquiry = {
            ...entry,
            severity,
            summary,
            detail: detail || undefined,
            version: version ?? entry.version,
            updated: new Date(),
            updatedBy: principal.id
        };
        const updated = await saveInquiries(slot, withInquiry(slot, edited));

        await logActivity(
            LogCategory.SLOT,
            "slot.inquiry_edited",
            `<principal> edited inquiry #${inquiryNumber} on slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) } }
        );

        res.status(StatusCodes.OK).json(toRefinementDetail(updated, version, canReadFaq()));
    })
);

// Remove an inquiry outright. Reserved for one raised by mistake - anything genuinely considered and
// dropped is resolved instead, so the record of that decision survives
router.delete(
    "/:slot/inquiries/:inquiry",
    validateRequest(
        (principal) =>
            hasPermission(principal, Permission.DELETE_INQUIRIES) ||
            hasPermission(principal, Permission.RAISE_INQUIRIES)
    ),
    celebrate({ [Segments.PARAMS]: InquiryParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number; inquiry: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber, inquiry: inquiryNumber } = req.params;

        const slot = await requireSlot(project.number, slotNumber);
        const entry = requireInquiry(slot, inquiryNumber);

        const { principal } = getContext();
        if (entry.createdBy !== principal.id && !hasPermission(principal, Permission.DELETE_INQUIRIES)) {
            throw new ApiErrorResponse(
                StatusCodes.FORBIDDEN,
                "Forbidden",
                "Only the person who raised this inquiry can delete it"
            );
        }
        // What was raised and how it ended is the record resolving it produced, so a resolved inquiry has
        // to be reopened first - deleting one is for a mistake, and a mistake is not something resolved
        if (!isInquiryOpen(entry)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Inquiry #${inquiryNumber} must be reopened before it can be deleted`
            );
        }

        const remaining = slot.statuses.design.inquiries.filter((existing) => existing.inquiry !== inquiryNumber);
        const updated = await saveInquiries(slot, remaining);
        // Said in the thread rather than done to it: people replied there, and taking their words away to
        // record that the thing they answered is gone is a worse account of it than saying so outright
        void endInquiryDiscussion(slot, entry);

        await logActivity(
            LogCategory.SLOT,
            "slot.inquiry_deleted",
            `<principal> deleted inquiry #${inquiryNumber} from slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) }, severity: "warn" }
        );

        res.status(StatusCodes.OK).json(
            toRefinementDetail(updated, await readFinalVersion(project, updated), canReadFaq())
        );
    })
);

// Resolve an inquiry. Anyone on the team may resolve anything, which is exactly why a note is asked for -
// it is the only record of why, and of who decided it when that is not the person who raised it
router.patch(
    "/:slot/inquiries/:inquiry/resolution",
    validateRequest(Permission.RESOLVE_INQUIRIES),
    // The body is validated in the handler rather than by celebrate: whether the note is required depends
    // on the stored inquiry, which is not loaded until the handler runs
    celebrate({ [Segments.PARAMS]: InquiryParams }),
    loadProjectByNumber,
    asyncHandler<
        { number: number; slot: number; inquiry: number },
        unknown,
        { status: "resolved"; note?: string },
        unknown
    >(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber, inquiry: inquiryNumber } = req.params;

        const slot = await requireSlot(project.number, slotNumber);
        const entry = requireInquiry(slot, inquiryNumber);
        if (!isInquiryOpen(entry)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Inquiry #${inquiryNumber} has already been resolved`
            );
        }

        const { status, note } = validateBody<{ status: "resolved"; note?: string }>(
            Schemas.Slot.InquiryResolution(isInquiryAddressed(entry)),
            req.body
        );

        const { principal } = getContext();
        const now = new Date();
        const resolvedEntry: IRefinementInquiry = {
            ...entry,
            status,
            resolution: { by: principal.id, at: now, note },
            updated: now,
            updatedBy: principal.id
        };
        const updated = await saveInquiries(slot, withInquiry(slot, resolvedEntry));
        void closeInquiryDiscussion(project, updated, resolvedEntry);

        await logActivity(
            LogCategory.SLOT,
            "slot.inquiry_resolved",
            `<principal> resolved inquiry #${inquiryNumber} on slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) } }
        );

        res.status(StatusCodes.OK).json(
            toRefinementDetail(updated, await readFinalVersion(project, updated), canReadFaq())
        );
    })
);

// Reopen a resolved inquiry. Resolving is unrestricted, so it will occasionally be wrong, and deleting and
// re-raising would lose whatever discussion the inquiry had already gathered
router.delete(
    "/:slot/inquiries/:inquiry/resolution",
    validateRequest(Permission.RESOLVE_INQUIRIES),
    celebrate({ [Segments.PARAMS]: InquiryParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number; inquiry: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber, inquiry: inquiryNumber } = req.params;

        const slot = await requireSlot(project.number, slotNumber);
        const entry = requireInquiry(slot, inquiryNumber);
        if (isInquiryOpen(entry)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Inquiry #${inquiryNumber} is already open`
            );
        }

        const { principal } = getContext();
        const reopened: IRefinementInquiry = {
            ...entry,
            status: "open",
            resolution: undefined,
            updated: new Date(),
            updatedBy: principal.id
        };
        const updated = await saveInquiries(slot, withInquiry(slot, reopened));
        void reopenInquiryDiscussion(project, updated, reopened);

        await logActivity(
            LogCategory.SLOT,
            "slot.inquiry_reopened",
            `<principal> reopened inquiry #${inquiryNumber} on slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) }, severity: "warn" }
        );

        res.status(StatusCodes.OK).json(
            toRefinementDetail(updated, await readFinalVersion(project, updated), canReadFaq())
        );
    })
);

// Open a Discord thread for one inquiry. Opt-in, since a forum given a thread for every inquiry is a
// forum nobody reads, and idempotent - a second press gets the first thread
router.post(
    "/:slot/inquiries/:inquiry/discussion",
    validateRequest(Permission.RAISE_INQUIRIES),
    celebrate({ [Segments.PARAMS]: InquiryParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number; inquiry: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber, inquiry: inquiryNumber } = req.params;

        const slot = await requireSlot(project.number, slotNumber);
        const entry = requireInquiry(slot, inquiryNumber);

        // The thread names the card it is about, and a forum thread cannot be renamed into existence later
        const [card] = await dataService.cards.read({ project: project.number, number: slotNumber, latest: true });
        if (!card) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Slot #${slotNumber} does not have a card to discuss yet`
            );
        }

        const { principal } = getContext();
        let discord;
        try {
            discord = await startInquiryDiscussion(project, slot, entry, card, principal.id);
        } catch (err) {
            // Logged as well as answered: an ApiErrorResponse is reported at verbose, and its `cause`
            // does not survive the JSON.stringify that reporting uses
            logger.warn(new Error(`[Discord] Failed to open discussion for inquiry #${inquiryNumber}`, { cause: err }));
            throw new ApiErrorResponse(
                StatusCodes.BAD_GATEWAY,
                "Discord Error",
                "A discussion could not be opened for this inquiry. The refinement forum may be missing a tag it needs.",
                err
            );
        }

        const updated = await saveInquiries(
            slot,
            withInquiry(slot, { ...entry, _metadata: { ...entry._metadata, discord } })
        );

        await logActivity(
            LogCategory.SLOT,
            "slot.inquiry_discussed",
            `<principal> opened a discussion for inquiry #${inquiryNumber} on slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) } }
        );

        res.status(StatusCodes.OK).json(
            toRefinementDetail(updated, await readFinalVersion(project, updated), canReadFaq())
        );
    })
);

// Record that the caller has looked this card over. One entry per person, stamped with the version they
// read - a later version stales it, since refinement is largely about the exact wording
router.patch(
    "/:slot/refinement/check",
    validateRequest(Permission.SUBMIT_REFINEMENT_CHECK),
    celebrate({ [Segments.PARAMS]: SlotParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;

        const slot = await requireSlot(project.number, slotNumber);
        const version = await readFinalVersion(project, slot);
        if (!version) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Slot #${slotNumber} does not have a card to check yet`
            );
        }

        const { principal } = getContext();
        const refinement = withRefinementCheck(
            slot.statuses.design.checks.refinement,
            principal.id,
            version,
            new Date()
        );
        const updated = await saveRefinementChecks(slot, refinement);

        await logActivity(
            LogCategory.SLOT,
            "slot.refinement_checked",
            `<principal> checked slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) } }
        );

        res.status(StatusCodes.OK).json(toRefinementDetail(updated, version, canReadFaq()));
    })
);

// Withdraw the caller's own check
router.delete(
    "/:slot/refinement/check",
    validateRequest(Permission.SUBMIT_REFINEMENT_CHECK),
    celebrate({ [Segments.PARAMS]: SlotParams }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, unknown, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;

        const slot = await requireSlot(project.number, slotNumber);
        const { principal } = getContext();

        // Raising an inquiry records a check, so withdrawing one while still holding an inquiry would
        // leave the card claiming nobody has read it while your own questions sit on it
        if (slot.statuses.design.inquiries.some((entry) => entry.createdBy === principal.id)) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                "Your check cannot be withdrawn while you have inquiries on this card"
            );
        }

        const refinement = slot.statuses.design.checks.refinement.filter((entry) => entry.createdBy !== principal.id);
        const updated = await saveRefinementChecks(slot, refinement);

        res.status(StatusCodes.OK).json(
            toRefinementDetail(updated, await readFinalVersion(project, updated), canReadFaq())
        );
    })
);

// The refinement team's own notes on a card. Behind its own permission, which is why it is refused by
// the general PATCH /:slot alongside everything else a slot holds
router.patch(
    "/:slot/faq",
    validateRequest(Permission.EDIT_FAQ),
    celebrate({ [Segments.PARAMS]: SlotParams, [Segments.BODY]: Schemas.Slot.Faq }),
    loadProjectByNumber,
    asyncHandler<{ number: number; slot: number }, unknown, { faq: string }, unknown>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { slot: slotNumber } = req.params;

        const slot = await requireSlot(project.number, slotNumber);
        const updated = await dataService.slots.update({ ...slot, faq: req.body.faq || undefined });

        await logActivity(
            LogCategory.SLOT,
            "slot.faq_updated",
            `<principal> updated the FAQ notes for slot ${slotNumber} in <project>`,
            { context: { project: projectSnapshot(project) } }
        );

        res.status(StatusCodes.OK).json(toRefinementDetail(updated, await readFinalVersion(project, updated), true));
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

            const slot = await requireSlot(project.number, slotNumber);

            if (slot.release?.released) {
                throw new ApiErrorResponse(
                    StatusCodes.NOT_ACCEPTABLE,
                    "Invalid Release",
                    `Release "${slot.release.code}" has already been released and cannot be modified`
                );
            }

            if (slot.release) {
                const currentRelease = project.releases.find((r) => r.code === slot.release.code);
                if (currentRelease && areReleaseChecksClosed(currentRelease.status)) {
                    throw new ApiErrorResponse(
                        StatusCodes.NOT_ACCEPTABLE,
                        "Invalid Release",
                        `Release "${currentRelease.code}" has been approved and its placements can no longer be modified`
                    );
                }
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
                if (areReleaseChecksClosed(targetRelease.status)) {
                    throw new ApiErrorResponse(
                        StatusCodes.NOT_ACCEPTABLE,
                        "Invalid Release",
                        `Release "${code}" has been approved and its placements can no longer be modified`
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
