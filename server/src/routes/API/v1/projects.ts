import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { validateRequest } from "@/middleware/permissions";
import { Regex, SemanticVersion } from "common/utils";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { cloneDeep, isEqual } from "lodash-es";
import { factions, IPlaytestCard } from "common/models/cards";
import { IGetRequest, IGetResponse } from "@/types";
import { orderBy, paging } from "@/schemas";
import { generateGetResponse } from "@/utils";
import { syncImage } from "@/rendering/hosting";

const router = express.Router();

const validateProjectParam = () => {
    return asyncHandler<{ number: number }, unknown, unknown, unknown>(async (req, res, next) => {
        const { number } = req.params;
        const [project] = await dataService.projects.read({ number });
        if (!project) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Number", "Project with that number does not exist");
        }
        req["project"] = project;
        next();
    });
};

const handleGetProjects = [
    celebrate({
        [Segments.QUERY]: {
            filter: Schemas.SingleOrArray(Schemas.Project.Partial),
            ...paging(),
            ...orderBy<IProject>(Schemas.Project.Full, { created: "desc" })
        }
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<IProject>>(async (req, res, next) => {
        const { filter, orderBy, page, perPage } = req.query;
        const result = await dataService.projects.read(filter, orderBy, page, perPage);
        const count = await dataService.projects.count(filter);

        req["response"] = generateGetResponse(result, count);
        next();
    })
];

// Read projects
router.get("/",
    ...handleGetProjects,
    (req, res) => {
        const response = req["response"] as IGetResponse<IProject>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Read project by number
router.get("/:number",
    celebrate({
        [Segments.PARAMS]: {
            number: Joi.number().required()
        }
    }),
    asyncHandler<{ number: number }, unknown, unknown, unknown>(async (req, res, next) => {
        const { number } = req.params;
        try {
            req.query["filter"] = { number };
            next();
        } catch (err) {
            next(err);
        }
    }),
    ...handleGetProjects,
    (req, res) => {
        const response = req["response"] as IGetResponse<IProject>;
        const [project] = response.items;
        res.status(StatusCodes.OK).json(project);
    }
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
    celebrate({
        [Segments.PARAMS]: {
            number: Joi.number().required()
        }
    }),
    validateProjectParam(),
    asyncHandler(async (req, res, next) => {
        const project = req["project"] as IProject;
        if (!project) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Invalid Number", "Project with that number does not exist");
        }
        if (!project.draft) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", "Only draft projects can be initialised");
        }
        const cards = await dataService.cards.read({ project: project.number });
        const totalSlots = Object.values(project.cardCount).reduce((acc, num) => acc + num, 0);
        if (cards.length < totalSlots) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Card Slots", "Project is missing cards for allocated slots; either provide cards, or adjust card slots");
        }
        req["cards"] = cards;
        next();
    }),
    asyncHandler<{ number: number }, unknown, unknown, unknown>(async (req, res) => {
        let project = req["project"] as IProject;
        const cards = req["cards"] as IPlaytestCard[];
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
        // Destory + Create required, as version is a primary key
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
        res.status(StatusCodes.OK).json({
            project,
            cards: newCards
        });
    })
);

// Update project
router.put("/:number",
    validateRequest(Permission.EDIT_PROJECTS),
    celebrate({
        [Segments.PARAMS]: {
            number: Joi.number().required()
        },
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

                shifts[faction] = {
                    offset: totalShift,
                    newMax: newMax
                };

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
    celebrate({
        [Segments.PARAMS]: {
            number: Joi.number().required()
        }
    }),
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

// Process playtesting update
router.post("/:number/playtesting/update",
    validateRequest(Permission.GENERATE_PLAYTESTING_UPDATES),
    celebrate({
        [Segments.PARAMS]: {
            number: Joi.number().required()
        },
        [Segments.BODY]: Schemas.PlaytestingUpdate.Draft
    }),
    validateProjectParam(),
    asyncHandler<{ number: number }, unknown, IPlaytestingUpdate, unknown>(async (req, res, next) => {
        const project = req["project"] as IProject;

        if (!project.active) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", "Cannot create playtesting update for inactive projects");
        }

        const playtestingUpdate = req.body;

        const draftCards = await dataService.cards.read({ project: project.number, draft: true });
        const newCards: IPlaytestCard[] = [];
        const missing: string[] = [];

        for (const [number, version] of Object.entries(playtestingUpdate.cardChanges)) {
            const draftCard = draftCards.find(((card) => card.number === parseInt(number) && card.version === version));
            if (!draftCard) {
                missing.push(`${number} (v${version})`);
            } else {
                newCards.push(draftCard);
            }
        }

        if (missing.length > 0) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Card Changes", `Some card changes do not exist as draft cards: ${missing.join(", ")}`);
        }

        req["project"] = project;
        req["playtestingUpdate"] = playtestingUpdate;
        req["newCards"] = newCards;
        next();
    }),
    asyncHandler(async (req, res) => {
        let project = req["project"] as IProject;
        let playtestingUpdate = req["playtestingUpdate"] as IPlaytestingUpdate;
        let newCards = req["newCards"] as IPlaytestCard[];

        playtestingUpdate.project = project.number;
        playtestingUpdate.version = project.version + 1;

        playtestingUpdate = await dataService.playtestingUpdates.create(playtestingUpdate);

        for (const newCard of newCards) {
            // Cards are no longer in draft. Update process will automatically update them to latest
            newCard.draft = false;
        }
        newCards = await dataService.cards.update(newCards);

        project.version = project.version + 1;
        project.updated = new Date();

        project = await dataService.projects.update(project);

        res.status(StatusCodes.OK).json({
            playtestingUpdate,
            project,
            cards: newCards
        });
    })
);

// Sync project card images
router.post("/:number/sync/images",
    validateRequest(Permission.SAVE_RENDER_FILES),
    celebrate({
        [Segments.PARAMS]: {
            number: Joi.number().required()
        },
        [Segments.QUERY]: {
            number: Joi.number(),
            version: Joi.string().regex(Regex.SemanticVersion),
            latest: Joi.boolean()
        }
    }),
    validateProjectParam(),
    asyncHandler<{ number: number }, unknown, unknown, { number?: number, version?: SemanticVersion, latest?: boolean }>(async (req, res) => {
        const project = req["project"] as IProject;
        const { number, version, latest } = req.query;
        let cards = await dataService.cards.read({ project: project.number, number, version, latest });

        cards = await syncImage(cards);

        res.status(StatusCodes.OK).json(cards);
    })
);

export default router;