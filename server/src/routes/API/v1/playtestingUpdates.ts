import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { validateRequest, validateProjectAccess } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { IGetRequest, IGetResponse } from "@/types";
import { applyToFilter, generateGetResponse, loadProjectByParam } from "@/utils";
import { IPlaytestCard } from "common/models/cards";
import { getRequestSchema } from "@/schemas";
import { asPDF } from "@/rendering";
import { hasPermission, renderPlaytestingCard } from "common/utils";
import { syncCodePullRequests, syncDataPullRequests } from "@/github/pullRequests";

const router = express.Router();

async function getPlaytestingUpdates(
    filter: IGetRequest<IPlaytestingUpdate>["filter"],
    orderBy: IGetRequest<IPlaytestingUpdate>["orderBy"],
    page: IGetRequest<IPlaytestingUpdate>["page"],
    perPage: IGetRequest<IPlaytestingUpdate>["perPage"]
): Promise<IGetResponse<IPlaytestingUpdate>> {
    const [result, count] = await Promise.all([
        dataService.playtestingUpdates.read(filter, orderBy, page, perPage),
        dataService.playtestingUpdates.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(
    Schemas.PlaytestingUpdate.Full,
    { created: "desc" }
);

// Read playtesting updates
router.get("/",
    validateRequest(Permission.READ_PLAYTESTING_UPDATES),
    celebrate({
        [Segments.QUERY]: getQuerySchema
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<IPlaytestingUpdate>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getPlaytestingUpdates(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read playtesting update by project/version
router.get("/:project/:version",
    validateRequest(Permission.READ_PLAYTESTING_UPDATES),
    celebrate({
        [Segments.PARAMS]: { project: Joi.number().required(), version: Joi.number().required() },
        [Segments.QUERY]: getQuerySchema
    }),
    loadProjectByParam,
    validateProjectAccess,
    asyncHandler<{ project: number, version: number }, unknown, unknown, IGetRequest<IProject>>(async (req, res) => {
        const { project, version } = req.params;
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getPlaytestingUpdates(applyToFilter(filter, { project, version }), orderBy, page, perPage);
        const [playtestingUpdate] = response.items;
        res.status(StatusCodes.OK).json(playtestingUpdate);
    })
);

// Process playtesting update
router.post("/:project",
    validateRequest(Permission.CREATE_PLAYTESTING_UPDATES),
    celebrate({
        [Segments.PARAMS]: { project: Joi.number().required() },
        [Segments.BODY]: Schemas.PlaytestingUpdate.Draft
    }),
    loadProjectByParam,
    asyncHandler<{ project: number }, unknown, IPlaytestingUpdate, unknown>(async (req, res, next) => {
        const project = res.locals.project as IProject;

        if (!project.active) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", "Cannot create playtesting update for inactive projects");
        }

        const playtestingUpdate = req.body;
        const draftCards = await dataService.cards.read({ project: project.number, draft: true });
        const newCards: IPlaytestCard[] = [];
        const missing: string[] = [];

        for (const [number, version] of Object.entries(playtestingUpdate.cardChanges)) {
            const draftCard = draftCards.find((card) => card.number === parseInt(number) && card.version === version);
            if (!draftCard) {
                missing.push(`${number} (v${version})`);
            } else {
                newCards.push(draftCard);
            }
        }

        if (missing.length > 0) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Card Changes", `Some card changes do not exist as draft cards: ${missing.join(", ")}`);
        }

        res.locals.playtestingUpdate = playtestingUpdate;
        res.locals.newCards = newCards;
        next();
    }),
    asyncHandler(async (req, res) => {
        let project = res.locals.project as IProject;
        let playtestingUpdate = res.locals.playtestingUpdate as IPlaytestingUpdate;
        let newCards = res.locals.newCards as IPlaytestCard[];

        playtestingUpdate.project = project.number;
        playtestingUpdate.version = project.version + 1;
        playtestingUpdate = await dataService.playtestingUpdates.create(playtestingUpdate);

        for (const newCard of newCards) {
            newCard.draft = false;
        }
        newCards = await dataService.cards.update(newCards);

        project.version = playtestingUpdate.version;
        project = await dataService.projects.update(project);

        res.status(StatusCodes.OK).json({ playtestingUpdate, project, cards: newCards });
    })
);

// Get cards for playtesting update
router.get("/:project/:version/cards",
    validateRequest(Permission.READ_PLAYTESTING_UPDATES),
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            version: Joi.number().required()
        }
    }),
    loadProjectByParam,
    validateProjectAccess,
    asyncHandler<{ project: number, version: number }, unknown, unknown, unknown>(async (req, res) => {
        const { version } = req.params;
        const project = res.locals.project as IProject;

        const [playtestingUpdate] = await dataService.playtestingUpdates.read({ project: project.number, version });
        if (!playtestingUpdate) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", `Playtesting update v${version} for project #${project.number} does not exist`);
        }

        const cards = await dataService.cards.forUpdate(playtestingUpdate);
        res.status(StatusCodes.OK).json(cards);
    })
);

// Get print sheet for playtesting update
router.get("/:project/:version/print-sheet",
    validateRequest(Permission.READ_PLAYTESTING_UPDATES),
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            version: Joi.number().required()
        }
    }),
    loadProjectByParam,
    validateProjectAccess,
    asyncHandler<{ project: number, version: number }, unknown, unknown, unknown>(async (req, res) => {
        const { version } = req.params;
        const project = res.locals.project as IProject;

        const [playtestingUpdate] = await dataService.playtestingUpdates.read({ project: project.number, version });
        if (!playtestingUpdate) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", `Playtesting update v${version} for project #${project.number} does not exist`);
        }

        const cards = await dataService.cards.forUpdate(playtestingUpdate);
        const pdf = await asPDF(cards.map((card) => renderPlaytestingCard(card)));

        res.status(StatusCodes.OK)
            .contentType("application/pdf")
            .setHeader("Content-Disposition", `attachment; filename="${project.code}-v${version}-changes.pdf"`)
            .send(pdf);
    })
);

// Get all implemented cards for this update
router.get("/:project/:version/implemented",
    validateRequest(Permission.READ_PLAYTESTING_UPDATES),
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            version: Joi.number().required()
        }
    }),
    loadProjectByParam,
    validateProjectAccess,
    asyncHandler<{ project: number, version: number }, unknown, unknown, unknown>(async (req, res) => {
        const { version } = req.params;
        const project = res.locals.project as IProject;

        const [playtestingUpdate] = await dataService.playtestingUpdates.read({ project: project.number, version });
        if (!playtestingUpdate) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", `Playtesting update v${version} for project #${project.number} does not exist`);
        }
        const [previous] = await dataService.playtestingUpdates.read([{ project: project.number, version: { $lt: version } }], { version: "desc" }, 1, 1);
        const fromDate = previous?._metadata?.github?.code?.mergedAt;
        const toDate = playtestingUpdate._metadata?.github?.code?.mergedAt ?? playtestingUpdate.updated;

        // Only return recently implemented for this project
        const cards = await dataService.cards.read([{ project: project.number, _metadata: { github: { closedAt: { $gt: fromDate, $lte: toDate } } } }]);

        res.status(StatusCodes.OK).json(cards);
    })
);

// Sync github pull requests
router.post("/:project/:version/sync/github/:type",
    celebrate({
        [Segments.PARAMS]: {
            project: Joi.number().required(),
            version: Joi.number().required(),
            type: Joi.string().valid("code", "data").required()
        },
        [Segments.QUERY]: {
            forced: Joi.boolean()
        }
    }),
    validateRequest<{ project: number, version: number, type: "code" | "data" }, unknown, unknown, unknown>((principal, req) => {
        const { type } = req.params;
        switch (type) {
            case "code": return hasPermission(principal, Permission.SYNC_PLAYTESTINGUPDATE_GITHUB_CODE);
            case "data": return hasPermission(principal, Permission.SYNC_PLAYTESTINGUPDATE_GITHUB_DATA);
            default: return false;
        }
    }),
    loadProjectByParam,
    asyncHandler<{ project: number, version: number, type: "code" | "data" }, unknown, unknown, unknown>(async (req, res, next) => {
        const { version } = req.params;
        const project = res.locals.project as IProject;

        const [playtestingUpdate] = await dataService.playtestingUpdates.read({ project: project.number, version });
        if (!playtestingUpdate) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Number", "Playtesting Update with that number & version does not exist");
        }
        res.locals.playtestingUpdate = playtestingUpdate;
        next();
    }),
    asyncHandler<{ project: number, version: number, type: "code" | "data" }, unknown, unknown, { forced?: boolean }>(async (req, res) => {
        const { type } = req.params;
        const { forced } = req.query;
        let playtestingUpdate = res.locals.playtestingUpdate as IPlaytestingUpdate;

        switch (type) {
            case "code": {
                const updates = await syncCodePullRequests(forced);
                playtestingUpdate = updates.find((pu) => pu.project === playtestingUpdate.project && pu.version === playtestingUpdate.version) ?? playtestingUpdate;
                break;
            }
            case "data": {
                const updates = await syncDataPullRequests(forced);
                playtestingUpdate = updates.find((pu) => pu.project === playtestingUpdate.project && pu.version === playtestingUpdate.version) ?? playtestingUpdate;
                break;
            }
        }

        res.status(StatusCodes.OK).json(playtestingUpdate);
    })
);

export default router;