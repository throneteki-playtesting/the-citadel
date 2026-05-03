import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { validateRequest } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse, loadProjectByParam } from "@/utils";
import { IPlaytestCard } from "common/models/cards";
import { getRequestSchema } from "@/schemas";

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

        project.version = project.version + 1;
        project.updated = new Date();
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

export default router;