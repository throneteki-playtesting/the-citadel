import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { inc } from "semver";
import { dataService } from "@/services";
import { hasPermission, isPreview, parseCardCode, Regex, SemanticVersion } from "common/utils";
import { IPlaytestCard } from "common/models/cards";
import * as Schemas from "common/models/schemas";
import Permission from "common/models/permissions";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/middleware/permissions";
import { applyToFilter, generateGetResponse, NoteVersion } from "@/utils";
import { IGetRequest, IGetResponse } from "@/types";
import { syncImage } from "@/rendering/hosting";
import { syncCardForum } from "@/discord/forums/cardForum";
import { syncIssues } from "@/github/issues";
import { getRequestSchema } from "@/schemas";
import { IProject } from "common/models/projects";

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
    version: Joi.alternatives().try(
        Joi.string().regex(Regex.SemanticVersion),
        Joi.string().valid("latest")
    ).required()
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

const getQuerySchema = getRequestSchema(
    Schemas.PlaytestingCard.Full,
    { project: "asc", number: "asc", version: "asc" }
);

// Read all cards
router.get("/",
    validateRequest(Permission.READ_CARDS),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<IPlaytestCard>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getCards(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read cards for project
router.get("/:project",
    celebrate({ [Segments.PARAMS]: ProjectParams }),
    validateRequest(Permission.READ_CARDS),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    asyncHandler<{ project: number }, unknown, unknown, IGetRequest<IPlaytestCard>>(async (req, res) => {
        const { project } = req.params;
        const { filter, orderBy, page, perPage } = req.query;

        const normalizedFilter = applyToFilter(filter, { project });
        const response = await getCards(normalizedFilter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read all versions of a card in a project
router.get("/:project/:number",
    celebrate({ [Segments.PARAMS]: CardParams }),
    validateRequest(Permission.READ_CARDS),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    asyncHandler<{ project: number, number: number }, unknown, unknown, IGetRequest<IPlaytestCard>>(async (req, res) => {
        const { project, number } = req.params;
        const { filter, orderBy, page, perPage } = req.query;

        const normalizedFilter = applyToFilter(filter, { project, number });
        const response = await getCards(normalizedFilter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read specific version of a card, or "latest"
router.get("/:project/:number/:version",
    celebrate({ [Segments.PARAMS]: CardVersionOrLatestParams }),
    validateRequest(Permission.READ_CARDS),
    asyncHandler<{ project: number, number: number, version: SemanticVersion | "latest" }, unknown, unknown, IPlaytestCard>(async (req, res) => {
        const { project, number, version } = req.params;

        const filter = version === "latest"
            ? { project, number, latest: true }
            : { project, number, version };
        const [response] = await dataService.cards.read(filter);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read previous version of a specific card
router.get("/:project/:number/:version/previous",
    celebrate({ [Segments.PARAMS]: CardVersionParams }),
    validateRequest(Permission.READ_CARDS),
    asyncHandler<{ project: number, number: number, version: SemanticVersion }, unknown, unknown, IPlaytestCard>(async (req, res) => {
        const { project, number, version } = req.params;

        const filter = { project, number, version };
        const response = await dataService.cards.previous(filter);
        res.status(StatusCodes.OK).json(response);
    })
);

// Upsert draft card
router.put("/:project/:number/draft",
    celebrate({
        [Segments.PARAMS]: CardParams,
        [Segments.BODY]: Schemas.PlaytestingCard.Draft
    }),
    // Load and validate entities, separate from permission check
    asyncHandler<{ project: number, number: number }, unknown, IPlaytestCard, unknown>(async (req, res, next) => {
        const { project: projectNumber, number } = req.params;
        const { version } = req.body;

        const [project] = await dataService.projects.read({ number: projectNumber });
        if (!project) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Project #${projectNumber} does not exist`);
        }

        // Note: Can only have multiple drafts per number when project is in draft
        const [[latest], draft] = await Promise.all([
            dataService.cards.read({ project: projectNumber, number, latest: true }),
            dataService.cards.read({ project: projectNumber, number, draft: true })
        ]);

        if (!project.draft && !(latest || draft)) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Card #${number} does not exist for project #${projectNumber}`);
        }
        if (project.draft && !/^0\.0\.\d+$/.test(version)) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Project #${projectNumber} is in draft and cannot accept cards with non-0.0.x version`);
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
    asyncHandler<{ project: number, number: number }, IPlaytestCard, IPlaytestCard, unknown>(async (req, res) => {
        const { number } = req.params;
        const project = res.locals.project as IProject;
        const latest = res.locals.latest as IPlaytestCard | undefined;
        const drafts = res.locals.draft as IPlaytestCard[] | undefined;

        const card = req.body;
        const code = parseCardCode(false, project.number, number);

        if (latest) {
            card.version = isPreview(latest) ? latest.version : inc(latest.version, NoteVersion[card.note.type]) as SemanticVersion;
        }

        card.code = code;
        card.draft = true;
        card.latest = false;
        card.implemented = false;
        if (card._metadata) {
            delete card._metadata.github;
            delete card._metadata.imageUrl;
        }
        delete card.release;

        const process = async (action: "create" | "update") => {
            switch (action) {
                case "create":
                    return dataService.cards.create(card, !project.draft);
                case "update":
                    return dataService.cards.update(card, !project.draft);
            }
        };

        if (project.draft) {
            // If version is 0.0.0, then it is being added as an option for that slot/number.
            // We distinct card options by incrementing the patch to the next available number
            if (card.version === "0.0.0") {
                const usedVersions = new Set(drafts.map(d => d.version));
                const newVersion = Array.from({ length: 1000 }, (_, i) => `0.0.${i + 1}` as SemanticVersion).find((v) => !usedVersions.has(v));
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
router.delete("/:project/:number/draft/:version?",
    validateRequest(Permission.DELETE_CARDS),
    celebrate({
        [Segments.PARAMS]: {
            ...CardParams,
            version: Joi.string().optional().regex(Regex.SemanticVersion)
        }
    }),
    asyncHandler<{ project: number, number: number, version?: SemanticVersion }, unknown, unknown, unknown>(async (req, res) => {
        const { project, number, version } = req.params;
        const [deleted] = await dataService.cards.destroy({ project, number, version, draft: true });
        if (!deleted) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Draft card for #${number} in project #${project} does not exist`);
        }
        res.status(StatusCodes.OK).json(deleted);
    })
);

router.post("/:project/:number/:version/sync/:type",
    celebrate({
        [Segments.PARAMS]: {
            ...CardVersionParams,
            type: Joi.string().valid("image", "discord", "github")
        }
    }),
    validateRequest((principal, req) => {
        const { type } = req.params;
        switch (type) {
            case "image": return hasPermission(principal, Permission.SYNC_CARD_IMAGES);
            case "discord": return hasPermission(principal, Permission.SYNC_CARD_DISCORD);
            case "github": return hasPermission(principal, Permission.SYNC_CARD_GITHUB);
            default: return false;
        }
    }),
    asyncHandler<{ project: number, number: number, version: SemanticVersion, type: "image" | "discord" | "github" }, unknown, unknown, unknown>(async (req, res) => {
        const { project, number, version, type } = req.params;

        let [card] = await dataService.cards.read({ project, number, version });

        switch (type) {
            case "image": {
                card = await syncImage(card);
                break;
            }
            case "discord": {
                [card] = await syncCardForum([card]);
                break;
            }
            case "github": {
                [card] = await syncIssues([card]);
                break;
            }
        }

        res.status(StatusCodes.OK).json(card);
    })
);

export default router;