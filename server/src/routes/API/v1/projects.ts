import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { FactionCardCount, IProject } from "common/models/projects";
import { validateRequest, validateProjectAccess, PermissionErrorResponse } from "@/middleware/permissions";
import { getContext } from "@/middleware/context";
import { hasPermission, Regex, SemanticVersion } from "common/utils";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { cloneDeep } from "lodash-es";
import { factions, IPlaytestCard } from "common/models/cards";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse, applyToFilter, loadProjectByNumber, buildExpansionRelease } from "@/utils";
import { ProjectStats } from "common/models/stats";
import { syncImage } from "@/rendering/hosting";
import { getRequestSchema } from "@/schemas";
import slots from "./slots";
import releases from "./releases";
import { logActivity, projectSnapshot } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";

const router = express.Router();

router.use("/:number/slots", slots);
router.use("/:number/releases", releases);

const numberParams = {
    number: Joi.number().required()
};

const validateProjectQueryPermission = asyncHandler<unknown, unknown, unknown, IGetRequest<IProject>>(async (req, _res, next) => {
    const { principal } = getContext();

    if (hasPermission(principal, Permission.READ_ARCHIVED_PROJECTS)) {
        return next();
    }

    const filters = Array.isArray(req.query.filter) ? req.query.filter : [req.query.filter];
    if (filters.some(f => f?.active === false)) {
        throw new PermissionErrorResponse();
    }

    req.query.filter = applyToFilter(req.query.filter, { active: true });
    next();
});

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
    celebrate({
        [Segments.QUERY]: getQuerySchema
    }),
    validateProjectQueryPermission,
    asyncHandler<unknown, unknown, unknown, IGetRequest<IProject>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getProjects(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read project by number
router.get("/:number",
    celebrate({
        [Segments.PARAMS]: numberParams,
        [Segments.QUERY]: getQuerySchema
    }),
    loadProjectByNumber,
    validateProjectAccess,
    asyncHandler(async (_req, res) => {
        res.status(StatusCodes.OK).json(res.locals.project);
    })
);

// Read project stats
router.get("/:number/stats",
    validateRequest(Permission.READ_STATS_PROJECT),
    celebrate({ [Segments.PARAMS]: numberParams }),
    loadProjectByNumber,
    validateProjectAccess,
    asyncHandler<{ number: number }, unknown, unknown, unknown>(async (req, res) => {
        const { number } = req.params;

        const [changedCards, reviews, decks] = await Promise.all([
            dataService.cards.read({ project: number, version: { $ne: "1.0.0" } }),
            dataService.reviews.read({ project: number }),
            dataService.decks.forCards({ project: number })
        ]);

        const factionCount = new Set(changedCards.map((card) => card.faction)).size;
        const reviewerCount = new Set(reviews.map((review) => review.reviewer)).size;

        const stats: ProjectStats = {
            cardChanges: { total: changedCards.length, factionCount },
            reviews: { total: reviews.length, reviewerCount },
            activeDecks: { total: decks.length }
        };

        res.status(StatusCodes.OK).json(stats);
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
        body.cardCount = factions.reduce((acc, faction) => ({ ...acc, [faction]: 0 }), {} as FactionCardCount);
        body.releases = [];
        const project = await dataService.projects.create(body);

        await logActivity(
            LogCategory.PROJECT,
            "project.created",
            "<principal> created project <project>",
            { context: { project: projectSnapshot(project) } }
        );

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
        const totalSlots = await dataService.slots.count({ project: project.number });
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
        project.active = true;

        // Expansions ship as one release containing every card - seed it now, as slots are fixed once initialised
        if (project.type === "expansion") {
            const { principal } = getContext();
            const slots = await dataService.slots.read({ project: project.number });
            const { release, assignedSlots } = buildExpansionRelease(project, slots, principal.id);
            project.releases = [release];
            if (assignedSlots.length > 0) {
                await dataService.slots.update(assignedSlots);
            }
        }

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

        await logActivity(
            LogCategory.PROJECT,
            "project.initialised",
            "<principal> initialised project <project>",
            { context: { project: projectSnapshot(project) }, severity: "warn" }
        );

        res.status(StatusCodes.OK).json({ project, cards: newCards });
    })
);

// Update project
router.put("/:number",
    validateRequest(Permission.EDIT_PROJECTS),
    celebrate({
        [Segments.PARAMS]: numberParams,
        [Segments.BODY]: Schemas.Project.Draft
    }),
    asyncHandler<{ number: number }, unknown, IProject, unknown>(async (req, res) => {
        const { number } = req.params;
        let project = req.body;

        const newNumber = project.number !== number;
        project.number = number;

        const [previous] = await dataService.projects.read({ number: project.number });
        if (!previous.draft && !previous.active) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", "Archived projects cannot be edited");
        }
        // cardCount & releases are server-maintained caches (kept in sync via the slots/releases endpoints) -
        // never trust or overwrite them from a general project edit body
        project.cardCount = previous.cardCount;
        project.releases = previous.releases;

        // If the project number changes, we need to destroy + create, as its a primary key
        if (newNumber) {
            await dataService.projects.destroy({ number });
            project = await dataService.projects.create(project);
        } else {
            project = await dataService.projects.update(project);
        }

        await logActivity(
            LogCategory.PROJECT,
            "project.updated",
            "<principal> updated project <project>",
            { context: { project: projectSnapshot(project) } }
        );

        res.status(StatusCodes.OK).json(project);
    })
);

// Delete draft project
router.delete("/:number",
    validateRequest(Permission.DELETE_PROJECTS),
    celebrate({ [Segments.PARAMS]: numberParams }),
    loadProjectByNumber,
    asyncHandler(async (req, res, next) => {
        const project = res.locals.project as IProject;
        if (!project.draft) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", "Active projects cannot be deleted, only archived");
        }
        next();
    }),
    asyncHandler<{ number: number }, unknown, unknown, unknown>(async (req, res) => {
        const { number } = req.params;
        const [deleted] = await dataService.projects.destroy({ number });
        if (!deleted) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Project #${number} does not exist`);
        }
        await dataService.cards.destroy({ project: number });
        await dataService.slots.destroy({ project: number });

        await logActivity(
            LogCategory.PROJECT,
            "project.deleted",
            "<principal> deleted project <project>",
            { context: { project: projectSnapshot(deleted) }, severity: "warn" }
        );

        res.status(StatusCodes.OK).json(deleted);
    })
);

// Archive active project
router.post("/:number/archive",
    validateRequest(Permission.ARCHIVE_PROJECTS),
    celebrate({ [Segments.PARAMS]: numberParams }),
    loadProjectByNumber,
    asyncHandler(async (req, res, next) => {
        const project = res.locals.project as IProject;
        if (project.draft) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", "Draft projects cannot be archived, only deleted");
        }
        if (!project.active) {
            throw new ApiErrorResponse(StatusCodes.NOT_ACCEPTABLE, "Invalid Project", "Project is already archived");
        }
        next();
    }),
    asyncHandler(async (req, res) => {
        let project = res.locals.project as IProject;
        project.active = false;

        project = await dataService.projects.update(project);

        await logActivity(
            LogCategory.PROJECT,
            "project.archived",
            "<principal> archived project <project>",
            { context: { project: projectSnapshot(project) }, severity: "warn" }
        );

        res.status(StatusCodes.OK).json(project);
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
            latest: Joi.boolean(),
            forced: Joi.boolean()
        }
    }),
    loadProjectByNumber,
    asyncHandler<{ number: number }, unknown, unknown, { number?: number, version?: SemanticVersion, latest?: boolean, forced?: boolean }>(async (req, res) => {
        const project = res.locals.project as IProject;
        const { number, version, latest, forced } = req.query;
        let cards = await dataService.cards.read({ project: project.number, number, version, latest });

        cards = await syncImage(cards, forced);

        if (forced) {
            await logActivity(
                LogCategory.PROJECT,
                "project.images_synced",
                "<principal> forced an image sync for <project>",
                { context: { project: projectSnapshot(project) } }
            );
        }

        res.status(StatusCodes.OK).json(cards);
    })
);

export default router;