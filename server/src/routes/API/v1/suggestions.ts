import * as Schemas from "common/models/schemas";
import { celebrate, Joi, Segments } from "celebrate";
import Permission from "common/models/permissions";
import asyncHandler from "express-async-handler";
import express from "express";
import { ICardSuggestion } from "common/models/cards";
import { dataService } from "@/services";
import { hasPermission, validate } from "common/utils";
import { validateRequest } from "@/middleware/permissions";
import { IGetRequest, IGetResponse } from "@/types";
import { StatusCodes } from "http-status-codes";
import { generateGetResponse, applyToFilter } from "@/utils";
import { ApiErrorResponse } from "@/errors";
import { getRequestSchema } from "@/schemas";

const router = express.Router();

async function getSuggestions(
    filter: IGetRequest<ICardSuggestion>["filter"],
    orderBy: IGetRequest<ICardSuggestion>["orderBy"],
    page: IGetRequest<ICardSuggestion>["page"],
    perPage: IGetRequest<ICardSuggestion>["perPage"]
): Promise<IGetResponse<ICardSuggestion>> {
    const [result, count] = await Promise.all([
        dataService.suggestions.read(filter, orderBy, page, perPage),
        dataService.suggestions.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(
    Schemas.CardSuggestion.Full,
    { created: "desc" }
);

// Read tags
router.get("/tags",
    asyncHandler<unknown, unknown, unknown, unknown>(async (req, res) => {
        const result = await dataService.suggestions.tags();
        res.json(result);
    })
);

// Read suggestions
router.get("/",
    validateRequest(Permission.READ_SUGGESTIONS),
    celebrate({
        [Segments.QUERY]: getQuerySchema
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<ICardSuggestion>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getSuggestions(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

router.get("/:id",
    validateRequest(Permission.READ_SUGGESTIONS),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        [Segments.QUERY]: getQuerySchema
    }),
    asyncHandler<{ id: string }, unknown, unknown, IGetRequest<ICardSuggestion>>(async (req, res) => {
        const { id } = req.params;
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getSuggestions(applyToFilter(filter, { id }), orderBy, page, perPage);
        const [suggestion] = response.items;
        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Create suggestion
router.post("/",
    validateRequest(Permission.MAKE_SUGGESTIONS),
    celebrate({ [Segments.BODY]: Schemas.CardSuggestion.Draft }),
    asyncHandler<unknown, unknown, Omit<ICardSuggestion, "id" | "updated" | "created">, unknown>(async (req, res) => {
        const body = req.body;
        const created = new Date();
        let suggestion = { ...body, created, updated: created } as ICardSuggestion;
        suggestion = await dataService.suggestions.create(suggestion);
        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Update suggestion
router.put("/:id",
    // Initial check to see if they have one of the appropriate permissions
    validateRequest((principal) => hasPermission(principal, Permission.EDIT_SUGGESTIONS) || hasPermission(principal, Permission.MAKE_SUGGESTIONS)),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    // Load suggestion for ownership check
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res, next) => {
        const { id } = req.params;
        const [suggestion] = await dataService.suggestions.read({ id });
        if (!suggestion) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", `Suggestion with id ${id} does not exist`);
        }
        res.locals.suggestion = suggestion;
        next();
    }),
    // Further permission check, now with context of the suggestion
    validateRequest((principal, req, res) => {
        const suggestion = res.locals.suggestion as ICardSuggestion;
        return hasPermission(principal, Permission.EDIT_SUGGESTIONS) ||
            validate(principal, Permission.MAKE_SUGGESTIONS, (principal) => "discordId" in principal && principal.discordId === suggestion.user.discordId);
    }),
    celebrate({ [Segments.BODY]: Schemas.CardSuggestion.Full }),
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
    // Initial check to see if they have one of the appropriate permissions
    validateRequest((principal) => hasPermission(principal, Permission.DELETE_SUGGESTIONS) || hasPermission(principal, Permission.MAKE_SUGGESTIONS)),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    // Load suggestion for ownership check
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res, next) => {
        const { id } = req.params;
        const [suggestion] = await dataService.suggestions.read({ id });
        if (!suggestion) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", `Suggestion with id ${id} does not exist`);
        }
        res.locals.suggestion = suggestion;
        next();
    }),
    // Further permission check, now with context of the suggestion
    validateRequest((principal, req, res) => {
        const suggestion = res.locals.suggestion as ICardSuggestion;
        return hasPermission(principal, Permission.DELETE_SUGGESTIONS) ||
            validate(principal, Permission.MAKE_SUGGESTIONS, (principal) => "discordId" in principal && principal.discordId === suggestion.user.discordId);
    }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;
        const [deleted] = await dataService.suggestions.destroy({ id });
        res.status(StatusCodes.OK).json(deleted);
    })
);

export default router;