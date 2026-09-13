import { convertTDBCard, fetchTDBDeck } from "@/utils";
import { celebrate, Joi, Segments } from "@/celebrate";
import { Code, ILabeledCard } from "common/models/cards";
import { Card } from "common/models/schemas";
import { IDecklist } from "common/models/decks";
import { IGetRequest, IGetResponse } from "@/types";
import { getRequestSchema } from "@/schemas";
import { parseAPIRequest } from "@/middleware/filters";
import { Regex, THRONESDB_URL } from "common/utils";
import { UUID } from "common/models/shared";
import { thronesDbCardPoolService } from "@/services";
import express from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";

const router = express.Router();

// Same filter/orderBy/page/perPage query shape every other list endpoint uses (see IGetRequest<T>) -
// scoped to Card.Full plus the extra fields ILabeledCard adds on top of a plain ICard.
const LabeledCard = Card.Full.keys({
    label: Joi.string(),
    imageUrl: Joi.string(),
    workInProgress: Joi.boolean()
});
const getCardsQuerySchema = getRequestSchema(LabeledCard, { name: "asc", code: "asc" });

router.use(parseAPIRequest);

router.get(
    "/cards",
    celebrate({ [Segments.QUERY]: getCardsQuerySchema }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<ILabeledCard>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response: IGetResponse<ILabeledCard> = await thronesDbCardPoolService.search(
            filter,
            orderBy,
            page,
            perPage
        );
        res.status(StatusCodes.OK).json(response);
    })
);

router.get(
    "/deck/:identifier",
    celebrate({
        [Segments.PARAMS]: {
            identifier: Joi.alternatives()
                .try(Joi.number().integer(), Joi.string().guid({ version: ["uuidv4"] }))
                .required()
        }
    }),
    asyncHandler<{ identifier: number | UUID }, unknown, unknown, IDecklist>(async (req, res) => {
        const { identifier } = req.params;
        // If deck cannot be found, it should simply return nothing rather than error
        const deck = await fetchTDBDeck(identifier);
        res.status(StatusCodes.OK).json(deck);
    })
);

router.get(
    "/card/:code",
    celebrate({
        [Segments.PARAMS]: {
            code: Joi.string().regex(Regex.Card.code).required()
        }
    }),
    asyncHandler<{ code: Code }, unknown, unknown, ILabeledCard>(async (req, res) => {
        const { code } = req.params;

        const response = await fetch(`${THRONESDB_URL}/api/public/card/${code}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch card with code "${code}": ${response.statusText}`);
        }

        const json = await response.json();
        const card = convertTDBCard(json);
        res.status(StatusCodes.OK).json(card);
    })
);

export default router;
