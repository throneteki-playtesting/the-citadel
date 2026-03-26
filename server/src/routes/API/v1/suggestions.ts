import * as Schemas from "common/models/schemas";
import { celebrate, Joi, Segments } from "celebrate";
import Permission from "common/models/permissions";
import asyncHandler from "express-async-handler";
import express, { Request } from "express";
import { ICardSuggestion } from "common/models/cards";
import { dataService } from "@/services";
import { hasPermission, validate } from "common/utils";
import { validateRequest } from "@/middleware/permissions";
import { IGetRequest, IGetResponse } from "@/types";
import { StatusCodes } from "http-status-codes";
import { generateGetResponse } from "@/utils";
import { orderBy, paging } from "@/schemas";
import { ApiErrorResponse } from "@/errors";

const router = express.Router();

const handleGetSuggestions = [
    validateRequest(Permission.READ_SUGGESTIONS),
    celebrate({
        [Segments.QUERY]: {
            filter: Schemas.SingleOrArray(Schemas.CardSuggestion.Partial),
            ...paging(),
            ...orderBy<ICardSuggestion>(Schemas.CardSuggestion.Full, { created: "desc" })
        }
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<ICardSuggestion>>(async (req, res, next) => {
        const { filter, orderBy, page, perPage } = req.query;
        const result = await dataService.suggestions.read(filter, orderBy, page, perPage);
        const count = await dataService.suggestions.count(filter);

        req["response"] = generateGetResponse(result, count);
        next();
    })
];

// Read tags
router.get("/tags",
    asyncHandler<unknown, unknown, unknown, unknown>(async (req, res) => {
        const result = await dataService.suggestions.tags();

        res.json(result);
    })
);

// Read suggestions
router.get("/",
    ...handleGetSuggestions,
    (req, res) => {
        const response = req["response"] as IGetResponse<ICardSuggestion>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Read suggestion by id
router.get("/:id",
    celebrate({
        [Segments.PARAMS]: {
            id: Joi.string().required()
        }
    }), (req: Request<{ id: string }, unknown, unknown, IGetRequest<ICardSuggestion>>, res: unknown, next: (arg?: unknown) => void) => {
        const { id } = req.params;
        let { filter } = req.query;
        try {
            filter = filter || {};
            if (Array.isArray(filter)) {
                filter.forEach((f) => f.id = id);
            } else {
                filter.id = id;
            }
            req.query.filter = filter;
            next();
        } catch (err) {
            next(err);
        }
    },
    ...handleGetSuggestions,
    (req, res) => {
        const response = req["response"] as IGetResponse<ICardSuggestion>;
        const [suggestion] = response.items;
        res.status(StatusCodes.OK).json(suggestion);
    }
);

// Read suggestions by user
router.get("/:userDiscordId",
    celebrate({
        [Segments.PARAMS]: {
            userDiscordId: Joi.string().required()
        }
    }), (req: Request<{ userDiscordId: string }, unknown, unknown, IGetRequest<ICardSuggestion>>, res: unknown, next: (arg?: unknown) => void) => {
        const { userDiscordId } = req.params;
        let { filter } = req.query;
        try {
            filter = filter || {};
            if (Array.isArray(filter)) {
                filter.forEach((f) => f.user.discordId = userDiscordId);
            } else {
                filter.user.discordId = userDiscordId;
            }
            req.query.filter = filter;
            next();
        } catch (err) {
            next(err);
        }
    },
    ...handleGetSuggestions,
    (req, res) => {
        const response = req["response"] as IGetResponse<ICardSuggestion>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Create suggestion
router.post("/",
    validateRequest(Permission.MAKE_SUGGESTIONS),
    celebrate({
        [Segments.BODY]: Schemas.CardSuggestion.Draft
    }), asyncHandler<unknown, unknown, Omit<ICardSuggestion, "id" | "updated" | "created">, unknown>(async (req, res) => {
        const body = req.body;

        const created = new Date();
        let suggestion = {
            ...body,
            created,
            updated: created
        } as ICardSuggestion;
        suggestion = await dataService.suggestions.create(suggestion);

        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Update suggestion
router.put("/:id",
    celebrate({
        [Segments.PARAMS]: {
            id: Joi.string().required()
        }
    }),
    validateRequest(async (principal, req: Request<{ id: string }, unknown, ICardSuggestion, unknown>) => {
        const { id } = req.params;
        const [suggestion] = await dataService.suggestions.read({ id });
        return !!suggestion && hasPermission(principal, Permission.EDIT_SUGGESTIONS) || validate(principal, Permission.MAKE_SUGGESTIONS, (principal) => "discordId" in principal && principal.discordId === suggestion.user.discordId);
    }),
    celebrate({
        [Segments.BODY]: Schemas.CardSuggestion.Full
    }),
    asyncHandler<{ id: string }, unknown, ICardSuggestion, unknown>(async (req, res) => {
        const { id } = req.params;
        let suggestion = req.body;

        suggestion.id = id;
        suggestion.updated = new Date();

        suggestion = await dataService.suggestions.update(suggestion);

        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Delete suggestion
router.delete("/:id",
    celebrate({
        [Segments.PARAMS]: {
            id: Joi.string().required()
        }
    }),
    validateRequest(async (principal, req: Request<{ id: string }, unknown, unknown, unknown>) => {
        const { id } = req.params;
        const [suggestion] = await dataService.suggestions.read({ id });
        return !!suggestion && hasPermission(principal, Permission.DELETE_SUGGESTIONS) || validate(principal, Permission.MAKE_SUGGESTIONS, (principal) => "discordId" in principal && principal.discordId === suggestion.user.discordId);
    }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;
        const [deleted] = await dataService.suggestions.destroy({ id });
        if (!deleted) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Invalid Data", `Suggestion with id ${id} does not exist`);
        }
        res.status(StatusCodes.OK).json(deleted);
    })
);

export default router;