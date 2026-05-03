import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IProject } from "common/models/projects";
import { validateRequest } from "@/middleware/permissions";
import { Regex, SemanticVersion } from "common/utils";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { cloneDeep, isEqual } from "lodash-es";
import { factions, IPlaytestCard } from "common/models/cards";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse, applyToFilter, loadProjectByNumber } from "@/utils";
import { syncImage } from "@/rendering/hosting";
import { getRequestSchema } from "@/schemas";

const router = express.Router();

const numberParams = {
    number: Joi.number().required()
};

async function getProjects(
    filter: IGetRequest<IProject>["filter"],
    orderBy: IGetRequest<IProject>["orderBy"],
    page: IGetRequest<IProject>["page"],
    perPage: IGetRequest<IProject>["perPage"]
): Promise<IGetResponse<IProject>> {
    const [result, count] = await Promise.all([
        dataService.projects.read(filter, orderBy, page, perPage),
        dataService.projects.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(
    Schemas.Project.Full,
    { created: "desc" }
);

// Read projects
router.get("/",
    validateRequest(Permission.READ_PROJECTS),
    celebrate({
        [Segments.QUERY]: getQuerySchema
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<IProject>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getProjects(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read project by number
router.get("/:number",
    validateRequest(Permission.READ_PROJECTS),
    celebrate({
        [Segments.PARAMS]: numberParams,
        [Segments.QUERY]: getQuerySchema
    }),
    asyncHandler<{ number: number }, unknown, unknown, IGetRequest<IProject>>(async (req, res) => {
        const { number } = req.params;
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getProjects(applyToFilter(filter, { number }), orderBy, page, perPage);
        const [project] = response.items;
        res.status(StatusCodes.OK).json(project);
    })
);

// Create project
router.post("/",
    validateRequest(Permission.CREATE_PROJECTS),
    celebrate({
        [Segments.BODY]: Schemas.Project.Draft
    }),
    asyncHandler(async (req, res, next) => {
        const { number, name, code } = req.body;
        const [existing] = await dataService.projects.read([{ number }, { name }, { code }]);
        if (existing) {
            throw new ApiErrorResponse(StatusCodes.CONFLICT, "Already Exists", "Project with that number, name or code already exists");
        }
        next();
    }),
    asyncHandler<unknown, unknown, IProject, unknown>(async (req, res) => {
        const body = req.body;
        body.created = body.updated = new Date();
        const project = await dataService.projects.create(body);
        res.status(StatusCodes.OK).json(project);
    })
);

// Initialise drafted project
router.post("/:number/initialise",
    validateRequest(Permission.INITIALISE_PROJECTS),
    celebrate({ [Segments.PARAMS]: numberParams }),
    loadProjectByNumber,
    asyncHandler(async (req, res, next) => {
        const project = res.locals.project as IProject;
        if (!project.draft) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", "Only draft projects can be initialised");
        }
        const cards = await dataService.cards.read({ project: project.number });
        const totalSlots = Object.values(project.cardCount).reduce((acc, num) => acc + num, 0);
        if (cards.length < totalSlots) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Card Slots", "Project is missing cards for allocated slots; either provide cards, or adjust card slots");
        }
        res.locals.cards = cards;
        next();
    }),
    asyncHandler<{ number: number }, unknown, unknown, unknown>(async (req, res) => {
        let project = res.locals.project as IProject;
        const cards = res.locals.cards as IPlaytestCard[];
        let newCards: IPlaytestCard[] = [];
        // Mapping suggestion id's to the card numbers they have been consumed for
        const suggestionNumbers: Record<string, number> = {};

        project.draft = false;
        for (const card of cards) {
            const newCard: IPlaytestCard = { ...cloneDeep(card), version: "1.0.0", draft: false };
            if (newCard.suggestionId) {
                suggestionNumbers[newCard.suggestionId] = newCard.number;
            }
            newCards.push(newCard);
        }

        project = await dataService.projects.update(project);
        // Need to destroy old versions (0.0.0) and create new (1.0.0)
        // Destroy + Create required, as version is a primary key
        await dataService.cards.destroy(cards);
        newCards = await dataService.cards.create(newCards);

        // Archive any used suggestions
        const suggestionIds = Object.keys(suggestionNumbers);
        if (suggestionIds.length > 0) {
            const suggestions = await dataService.suggestions.read(suggestionIds.map((id) => ({ id })));
            for (const suggestion of suggestions) {
                suggestion.archivedReason = `Used for ${project.code} card #${suggestionNumbers[suggestion.id]}`;
            }
            await dataService.suggestions.update(suggestions);
        }

        res.status(StatusCodes.OK).json({ project, cards: newCards });
    })
);

// Update project
router.put("/:number",
    validateRequest(Permission.EDIT_PROJECTS),
    celebrate({
        [Segments.PARAMS]: numberParams,
        [Segments.BODY]: Schemas.Project.Full
    }),
    asyncHandler<{ number: number }, unknown, IProject, unknown>(async (req, res) => {
        const { number } = req.params;
        let project = req.body;

        const newNumber = project.number !== number;
        project.number = number;
        project.updated = new Date();

        const [previous] = await dataService.projects.read({ number: project.number });
        // If the project number changes, we need to destroy + create, as its a primary key
        if (newNumber) {
            await dataService.projects.destroy({ number });
            project = await dataService.projects.create(project);
        } else {
            project = await dataService.projects.update(project);
        }

        // If card counts changed, we need to adjust existing card numbers to ensure they move with the faction adjustments.
        // This means dynamically updating each card number based on the slots each previous faction should have.
        // NOTE: When a faction loses slots, any cards which can no longer fit are deleted.
        if (!isEqual(project.cardCount, previous.cardCount)) {
            const toDelete: IPlaytestCard[] = [];
            const toUpsert: IPlaytestCard[] = [];
            const shifts: Record<string, { offset: number; newMax: number }> = {};
            let previousLimit = 0;
            let totalShift = 0;

            for (const faction of factions) {
                const oldVal = previous.cardCount[faction];
                const newVal = project.cardCount[faction];
                previousLimit += oldVal;
                const newMax = previousLimit + totalShift + (newVal - oldVal);

                shifts[faction] = { offset: totalShift, newMax };
                totalShift += (newVal - oldVal);
            }

            const cards = await dataService.cards.read({ project: project.number });
            for (const card of cards) {
                const { offset, newMax } = shifts[card.faction];
                const newNumber = card.number + offset;

                if (newNumber > newMax) {
                    toDelete.push(card);
                } else if (offset !== 0) {
                    toDelete.push(card);
                    toUpsert.push({ ...card, number: newNumber });
                }
            }

            await dataService.cards.destroy(toDelete);
            await dataService.cards.update(toUpsert, true);
        }

        res.status(StatusCodes.OK).json(project);
    })
);

// Delete project
router.delete("/:number",
    validateRequest(Permission.DELETE_PROJECTS),
    celebrate({ [Segments.PARAMS]: numberParams }),
    asyncHandler<{ number: number }, unknown, unknown, unknown>(async (req, res) => {
        const { number } = req.params;
        const [deleted] = await dataService.projects.destroy({ number });
        if (!deleted) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Project #${number} does not exist`);
        }
        await dataService.cards.destroy({ project: number });
        res.status(StatusCodes.OK).json(deleted);
    })
);

// Sync project card images
router.post("/:number/sync/image",
    validateRequest(Permission.SYNC_CARD_IMAGES),
    celebrate({
        [Segments.PARAMS]: numberParams,
        [Segments.QUERY]: {
            number: Joi.number(),
            version: Joi.string().regex(Regex.SemanticVersion),
            latest: Joi.boolean()
        }
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number }, unknown, unknown, { number?: number, version?: SemanticVersion, latest?: boolean }>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { number, version, latest } = req.query;
        let cards = await dataService.cards.read({ project: project.number, number, version, latest });

        cards = await syncImage(cards);

        res.status(StatusCodes.OK).json(cards);
    })
);

// Sync github pull reqyests
router.post("/sync/github",
    validateRequest(Permission.SYNC_PROJECT_GITHUB),
    asyncHandler(async (req, res) => {
        const playtestingUpdates = await dataService.playtestingUpdates.sync();

        res.status(StatusCodes.OK).json(playtestingUpdates);
    })
);

export default router;