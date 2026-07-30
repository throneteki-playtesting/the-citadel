import express from "express";
import { celebrate, Joi, Segments } from "@/celebrate";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import * as Schemas from "common/models/schemas";
import { IPlaytestCard } from "common/models/cards";
import { DeckLink, DecklistLink, DeepPartial, SingleOrArray } from "common/types";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { generateGetResponse } from "@/utils";
import { getRequestSchema } from "@/schemas";
import { ApiErrorResponse } from "@/errors";
import { UUID } from "crypto";

const router = express.Router();

const identifierParam = {
    identifier: Joi.alternatives()
        .try(Joi.number().integer(), Joi.string().guid({ version: ["uuidv4"] }))
        .required()
};

// `filter` here is matched against the cards collection (project/number/version, etc.), not IDeck's
// own fields - reusing the same filter-schema builder as the cards list endpoint keeps validation in sync.
const cardFilterSchema = getRequestSchema(Schemas.PlaytestingCard.Full).extract("filter");

// Read decks, optionally scoped to those containing any card matching the given filter(s)
router.get(
    "/",
    validateRequest(Permission.READ_DECKS),
    celebrate({ [Segments.QUERY]: { filter: cardFilterSchema } }),
    asyncHandler<unknown, unknown, unknown, { filter?: SingleOrArray<DeepPartial<IPlaytestCard>> }>(
        async (req, res) => {
            const { filter } = req.query;
            const result = filter ? await dataService.decks.forCards(filter) : await dataService.decks.read();
            res.status(StatusCodes.OK).json(generateGetResponse(result));
        }
    )
);

// Read a single deck
router.get(
    "/:identifier",
    validateRequest(Permission.READ_DECKS),
    celebrate({ [Segments.PARAMS]: identifierParam }),
    asyncHandler<{ identifier: number | UUID }, unknown, unknown, unknown>(async (req, res) => {
        const { identifier } = req.params;
        const [deck] = await dataService.decks.read({ identifier });
        res.status(StatusCodes.OK).json(deck);
    })
);

// Add a deck to the pool directly, outside of the review process
router.post(
    "/",
    validateRequest(Permission.CREATE_DECKS),
    celebrate({ [Segments.BODY]: Schemas.Deck.Add }),
    asyncHandler<unknown, unknown, { link: DeckLink | DecklistLink }, unknown>(async (req, res) => {
        const { link } = req.body;
        const deck = await dataService.decks.refresh(link, "manual");
        if (!deck) {
            throw new ApiErrorResponse(
                StatusCodes.NOT_FOUND,
                "Invalid Link",
                "ThronesDB deck does not exist or is not public"
            );
        }
        res.status(StatusCodes.OK).json(deck);
    })
);

// Refresh a deck's data from ThronesDB
router.post(
    "/:identifier/refresh",
    validateRequest(Permission.EDIT_DECKS),
    celebrate({ [Segments.PARAMS]: identifierParam }),
    asyncHandler<{ identifier: number | UUID }, unknown, unknown, unknown>(async (req, res) => {
        const { identifier } = req.params;
        const [existing] = await dataService.decks.read({ identifier });
        if (!existing) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", "Deck with that identifier does not exist");
        }
        const deck = await dataService.decks.refresh(existing.link, "manual");
        res.status(StatusCodes.OK).json(deck);
    })
);

export default router;
