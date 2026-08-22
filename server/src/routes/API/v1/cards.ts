import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { inc } from "semver";
import { dataService } from "@/services";
import { hasPermission, isPreview, parseCardCode, Regex, SemanticVersion } from "common/utils";
import { IPlaytestCard } from "common/models/cards";
import * as Schemas from "common/models/schemas";
import Permission from "common/models/permissions";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { validateRequest, validateProjectAccess } from "@/middleware/permissions";
import { applyToFilter, generateGetResponse, loadProjectByParam, NoteVersion } from "@/utils";
import { IGetRequest, IGetResponse } from "@/types";
import { getContext } from "@/middleware/context";
import { syncImage } from "@/rendering/hosting";
import { syncCardForum } from "@/discord/forums/cardForum";
import { syncIssues } from "@/github/issues";
import { getRequestSchema } from "@/schemas";
import { IProject } from "common/models/projects";
import { cardSnapshot, logActivity, projectSnapshot } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";

const router = express.Router();

// Shared param schemas
const ProjectParams = {
    project: Joi.number().required()
};

const CardParams = {
    ...ProjectParams,
    number: Joi.number().required()
};

const CardVersionParams = {
    ...CardParams,
    version: Joi.string().regex(Regex.SemanticVersion)
};

const CardVersionOrLatestParams = {
    ...CardParams,
    version: Joi.alternatives()
        .try(Joi.string().regex(Regex.SemanticVersion), Joi.string().valid("latest", "visible"))
        .required()
};

// Core data-fetching logic, shared across GET routes
async function getCards(
    filter: IGetRequest<IPlaytestCard>["filter"],
    orderBy: IGetRequest<IPlaytestCard>["orderBy"],
    page: IGetRequest<IPlaytestCard>["page"],
    perPage: IGetRequest<IPlaytestCard>["perPage"]
): Promise<IGetResponse<IPlaytestCard>> {
    const [result, count] = await Promise.all([
        dataService.cards.read(filter, orderBy, page, perPage),
        dataService.cards.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(Schemas.PlaytestingCard.Full, {
    project: "asc",
    number: "asc",
    version: "asc"
});

function everyFilterHasLatest(filter: IGetRequest<IPlaytestCard>["filter"]): boolean {
    const filters = Array.isArray(filter) ? filter : [filter];
    return filters.length > 0 && filters.every((f) => f?.latest === true);
}

// Checks all filters to decide between READ_LATEST_CARDS and READ_CARDS being required
const validateCardQueryPermission = validateRequest<unknown, unknown, unknown, IGetRequest<IPlaytestCard>>(
    (principal, req) => {
        if (hasPermission(principal, Permission.READ_CARDS)) {
            return true;
        }
        if (everyFilterHasLatest(req.query.filter)) {
            return hasPermission(principal, Permission.READ_LATEST_CARDS);
        }
        return false;
    }
);

// Read all cards
router.get(
    "/",
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    validateCardQueryPermission,
    asyncHandler<unknown, unknown, unknown, IGetRequest<IPlaytestCard>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getCards(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read cards for project
router.get(
    "/:project",
    celebrate({ [Segments.PARAMS]: ProjectParams }),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    loadProjectByParam,
    validateProjectAccess,
    validateCardQueryPermission,
    asyncHandler<{ project: number }, unknown, unknown, IGetRequest<IPlaytestCard>>(async (req, res) => {
        const { project } = req.params;
        const { filter, orderBy, page, perPage } = req.query;

        const normalizedFilter = applyToFilter(filter, { project });
        const response = await getCards(normalizedFilter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read all versions of a card in a project
router.get(
    "/:project/:number",
    celebrate({ [Segments.PARAMS]: CardParams }),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    loadProjectByParam,
    validateProjectAccess,
    validateCardQueryPermission,
    asyncHandler<{ project: number; number: number }, unknown, unknown, IGetRequest<IPlaytestCard>>(
        async (req, res) => {
            const { project, number } = req.params;
            const { filter, orderBy, page, perPage } = req.query;

            const normalizedFilter = applyToFilter(filter, { project, number });
            const response = await getCards(normalizedFilter, orderBy, page, perPage);
            res.status(StatusCodes.OK).json(response);
        }
    )
);

// Read specific version of a card, "latest", or "visible" - the newest version the caller is entitled to see
router.get(
    "/:project/:number/:version",
    celebrate({ [Segments.PARAMS]: CardVersionOrLatestParams }),
    loadProjectByParam,
    validateProjectAccess,
    validateRequest<{ version: SemanticVersion | "latest" | "visible" }, unknown, unknown, unknown>(
        (principal, req) => {
            if (hasPermission(principal, Permission.READ_CARDS)) {
                return true;
            }
            if (
                hasPermission(principal, Permission.READ_LATEST_CARDS) &&
                (req.params.version === "latest" || req.params.version === "visible")
            ) {
                return true;
            }
            return false;
        }
    ),
    asyncHandler<
        { project: number; number: number; version: SemanticVersion | "latest" | "visible" },
        unknown,
        unknown,
        IPlaytestCard
    >(async (req, res) => {
        const { project, number, version } = req.params;

        if (version === "visible") {
            const { principal } = getContext();
            const canReadDrafts = hasPermission(principal, Permission.READ_CARDS);
            // Released & current, then (if allowed) the in-progress draft, then plain latest - the same
            // rank CardVersions.rank() uses client-side, but stopping at whatever this caller may see
            const candidates: IGetRequest<IPlaytestCard>["filter"][] = [
                { project, number, latest: true, released: { $exists: true } },
                ...(canReadDrafts ? [{ project, number, draft: true }] : []),
                { project, number, latest: true }
            ];
            let response: IPlaytestCard | undefined;
            for (const filter of candidates) {
                [response] = await dataService.cards.read(filter);
                if (response) {
                    break;
                }
            }
            res.status(StatusCodes.OK).json(response);
            return;
        }

        const filter = version === "latest" ? { project, number, latest: true } : { project, number, version };
        const [response] = await dataService.cards.read(filter);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read previous version of a specific card
router.get(
    "/:project/:number/:version/previous",
    celebrate({ [Segments.PARAMS]: CardVersionParams }),
    loadProjectByParam,
    validateProjectAccess,
    validateRequest(Permission.READ_CARDS),
    asyncHandler<{ project: number; number: number; version: SemanticVersion }, unknown, unknown, IPlaytestCard>(
        async (req, res) => {
            const { project, number, version } = req.params;

            const filter = { project, number, version };
            const response = await dataService.cards.previous(filter);
            res.status(StatusCodes.OK).json(response);
        }
    )
);

// Upsert draft card
router.put(
    "/:project/:number/draft",
    celebrate({
        [Segments.PARAMS]: CardParams,
        [Segments.BODY]: Schemas.PlaytestingCard.Draft
    }),
    // Load and validate entities, separate from permission check
    asyncHandler<{ project: number; number: number }, unknown, IPlaytestCard, unknown>(async (req, res, next) => {
        const { project: projectNumber, number } = req.params;
        const { version } = req.body;

        const [project] = await dataService.projects.read({ number: projectNumber });
        if (!project) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Invalid Data",
                `Project #${projectNumber} does not exist`
            );
        }

        // Note: Can only have multiple drafts per number when project is in draft
        const [[latest], draft, [slot]] = await Promise.all([
            dataService.cards.read({ project: projectNumber, number, latest: true }),
            dataService.cards.read({ project: projectNumber, number, draft: true }),
            dataService.slots.read({ project: projectNumber, number })
        ]);

        if (!project.draft && !(latest || draft)) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Invalid Data",
                `Card #${number} does not exist for project #${projectNumber}`
            );
        }
        if (project.draft && !/^0\.0\.\d+$/.test(version)) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Invalid Data",
                `Project #${projectNumber} is in draft and cannot accept cards with non-0.0.x version`
            );
        }
        if (slot?.release?.released) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_ACCEPTABLE,
                "Invalid Data",
                `Card #${number} has already been released and cannot start a new draft`
            );
        }

        res.locals.project = project;
        res.locals.latest = latest as IPlaytestCard | undefined;
        res.locals.draft = draft as IPlaytestCard[] | undefined;
        next();
    }),
    // Permission check now uses already-loaded entities from res.locals
    validateRequest((principal, req, res) => {
        const { draft } = res.locals;
        return hasPermission(principal, draft ? Permission.EDIT_CARDS : Permission.CREATE_CARDS);
    }),
    asyncHandler<{ project: number; number: number }, IPlaytestCard, IPlaytestCard, unknown>(async (req, res) => {
        const { number } = req.params;
        const project = res.locals.project as IProject;
        const latest = res.locals.latest as IPlaytestCard | undefined;
        const drafts = res.locals.draft as IPlaytestCard[] | undefined;

        const card = req.body;
        const code = parseCardCode(false, project.number, number);

        if (latest) {
            card.version = isPreview(latest)
                ? latest.version
                : (inc(latest.version, NoteVersion[card.note.type]) as SemanticVersion);
        }

        card.code = code;
        card.draft = true;
        card.latest = false;
        card.implemented = false;
        if (card._metadata) {
            delete card._metadata.github;
            delete card._metadata.imageUrl;
        }

        const process = async (action: "create" | "update") => {
            switch (action) {
                case "create":
                    await dataService.cards.create(card, !project.draft);
                    break;
                case "update":
                    await dataService.cards.update(card, !project.draft);
                    break;
            }

            await logActivity(
                LogCategory.CARD,
                action === "create" ? "card.draft.created" : "card.draft.updated",
                `<principal> ${action === "create" ? "created" : "updated"} draft <card>`,
                { context: { card: cardSnapshot(`${project.number}|${number}|${card.version}`, card) } }
            );
        };

        if (project.draft) {
            // If version is 0.0.0, then it is being added as an option for that slot/number.
            // We distinct card options by incrementing the patch to the next available number
            if (card.version === "0.0.0") {
                const usedVersions = new Set(drafts.map((d) => d.version));
                const newVersion = Array.from({ length: 1000 }, (_, i) => `0.0.${i + 1}` as SemanticVersion).find(
                    (v) => !usedVersions.has(v)
                );
                card.version = newVersion;
                await process("create");
            } else {
                await process("update");
            }
        } else {
            // When project is not in draft, can only be one (or none) existing drafts
            const existing = drafts[0];
            if (existing) {
                if (existing.version !== card.version) {
                    await dataService.cards.destroy({ project: project.number, number, version: existing.version });
                    await process("create");
                } else {
                    await process("update");
                }
            } else {
                await process("create");
            }
        }

        res.status(StatusCodes.OK).json(card);
    })
);

// Delete draft card
router.delete(
    "/:project/:number/draft/:version?",
    validateRequest(Permission.DELETE_CARDS),
    celebrate({
        [Segments.PARAMS]: {
            ...CardParams,
            version: Joi.string().optional().regex(Regex.SemanticVersion)
        }
    }),
    loadProjectByParam,
    asyncHandler<{ project: number; number: number; version?: SemanticVersion }, unknown, unknown, unknown>(
        async (req, res) => {
            const { number, version } = req.params;
            const project = res.locals.project as IProject;
            const [deleted] = await dataService.cards.destroy(
                { project: project.number, number, version, draft: true },
                !project.draft
            );
            if (!deleted) {
                throw new ApiErrorResponse(
                    StatusCodes.BAD_REQUEST,
                    "Invalid Data",
                    `Draft card for #${number} in project #${project} does not exist`
                );
            }

            await logActivity(LogCategory.CARD, "card.draft.deleted", "<principal> deleted draft <card>", {
                context: { card: cardSnapshot(`${project.number}|${number}|${deleted.version}`, deleted) },
                severity: "warn"
            });

            res.status(StatusCodes.OK).json(deleted);
        }
    )
);

router.post(
    "/:project/:number/:version/sync/:type",
    celebrate({
        [Segments.PARAMS]: {
            ...CardVersionParams,
            type: Joi.string().valid("image", "discord", "github").required()
        },
        [Segments.QUERY]: {
            forced: Joi.boolean()
        }
    }),
    validateRequest((principal, req) => {
        const { type } = req.params;
        switch (type) {
            case "image":
                return hasPermission(principal, Permission.SYNC_CARD_IMAGES);
            case "discord":
                return hasPermission(principal, Permission.SYNC_CARD_DISCORD);
            case "github":
                return hasPermission(principal, Permission.SYNC_CARD_GITHUB);
            default:
                return false;
        }
    }),
    asyncHandler<
        { project: number; number: number; version: SemanticVersion; type: "image" | "discord" | "github" },
        unknown,
        unknown,
        { forced: boolean }
    >(async (req, res) => {
        const { project, number, version, type } = req.params;
        const { forced } = req.query;
        let [card] = await dataService.cards.read({ project, number, version });

        switch (type) {
            case "image": {
                card = await syncImage(card, forced);
                break;
            }
            case "discord": {
                [card] = await syncCardForum([card], forced);
                break;
            }
            case "github": {
                [card] = await syncIssues([card], forced);
                break;
            }
        }

        if (forced) {
            await logActivity(LogCategory.CARD, "card.synced", `<principal> forced a ${type} sync for <card>`, {
                context: { card: cardSnapshot(`${project}|${number}|${version}`, card) }
            });
        }

        res.status(StatusCodes.OK).json(card);
    })
);

// Move a draft card to another slot - draft projects only. Faction follows the target slot.
router.post(
    "/:project/:number/:version/move",
    validateRequest(Permission.EDIT_CARDS),
    celebrate({
        [Segments.PARAMS]: CardVersionParams,
        [Segments.BODY]: { to: Joi.number().required() }
    }),
    asyncHandler<{ project: number; number: number; version: SemanticVersion }, unknown, { to: number }, unknown>(
        async (req, res) => {
            const { project: projectNumber, number, version } = req.params;
            const { to } = req.body;

            const [project] = await dataService.projects.read({ number: projectNumber });
            if (!project) {
                throw new ApiErrorResponse(
                    StatusCodes.BAD_REQUEST,
                    "Invalid Data",
                    `Project #${projectNumber} does not exist`
                );
            }
            if (!project.draft) {
                throw new ApiErrorResponse(
                    StatusCodes.NOT_ACCEPTABLE,
                    "Invalid Project",
                    "Cards can only be moved between slots while a project is in draft"
                );
            }

            const [card] = await dataService.cards.read({ project: projectNumber, number, version });
            if (!card) {
                throw new ApiErrorResponse(
                    StatusCodes.NOT_FOUND,
                    "Invalid Data",
                    `Card #${number} (v${version}) does not exist for project #${projectNumber}`
                );
            }

            const [[targetSlot], targetDrafts] = await Promise.all([
                dataService.slots.read({ project: projectNumber, number: to }),
                dataService.cards.read({ project: projectNumber, number: to, draft: true })
            ]);
            if (!targetSlot) {
                throw new ApiErrorResponse(
                    StatusCodes.BAD_REQUEST,
                    "Invalid Data",
                    `Slot #${to} does not exist for project #${projectNumber}`
                );
            }

            // Keep the card's version if it is free in the target slot; otherwise take the next available 0.0.x
            const usedVersions = new Set(targetDrafts.map((draft) => draft.version));
            const newVersion = usedVersions.has(version)
                ? Array.from({ length: 1000 }, (_, i) => `0.0.${i + 1}` as SemanticVersion).find(
                      (v) => !usedVersions.has(v)
                  )
                : version;

            const movedCard: IPlaytestCard = {
                ...card,
                number: to,
                version: newVersion,
                faction: targetSlot.faction,
                code: parseCardCode(false, projectNumber, to)
            };

            // number is part of the card's primary key, so a move requires destroy + create rather than an in-place update
            await dataService.cards.destroy({ project: projectNumber, number, version }, false);
            const [created] = await dataService.cards.create([movedCard], false);

            await logActivity(
                LogCategory.CARD,
                "card.moved",
                `<principal> moved <card> from slot ${number} to slot ${to} in <project>`,
                {
                    context: {
                        card: cardSnapshot(`${projectNumber}|${to}|${newVersion}`, movedCard),
                        project: projectSnapshot(project)
                    }
                }
            );

            res.status(StatusCodes.OK).json(created);
        }
    )
);

export default router;
