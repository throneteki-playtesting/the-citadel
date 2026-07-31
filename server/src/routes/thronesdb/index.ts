import { convertTDBCard, fetchTDBDeck } from "@/utils";
import { celebrate, Joi, Segments } from "@/celebrate";
import { Code, ILabeledCard } from "common/models/cards";
import { IDecklist } from "common/models/decks";
import { Regex } from "common/utils";
import { UUID } from "common/models/shared";
import express from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";

const router = express.Router();

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

        const response = await fetch(`https://thronesdb.com/api/public/card/${code}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch card with code "${code}": ${response.statusText}`);
        }

        const json = await response.json();
        const card = convertTDBCard(json);
        res.status(StatusCodes.OK).json(card);
    })
);

export default router;
