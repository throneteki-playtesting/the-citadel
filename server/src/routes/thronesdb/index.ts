import { dataService } from "@/services";
import { OAuthTokenResponse } from "@/types";
import { convertTDBCard, convertTDBDeck } from "@/utils";
import { celebrate, Joi, Segments } from "celebrate";
import { Code, ILabeledCard } from "common/models/cards";
import { IDecklist } from "common/models/decks";
import { Regex } from "common/utils";
import { UUID } from "crypto";
import express from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";

const router = express.Router();

router.get("/deck/:identifier",
    celebrate({
        [Segments.PARAMS]: {
            identifier: Joi.alternatives().try(
                Joi.number().integer(),
                Joi.string().guid({ version: ["uuidv4"] })
            ).required()
        }
    }),
    asyncHandler<{ identifier: number | UUID }, unknown, unknown, IDecklist>(async (req, res) => {
        const { identifier } = req.params;

        let response: Response = null;
        if (typeof identifier === "number") {
            // Id decks are publicly available
            response = await fetch(`https://thronesdb.com/api/public/decklist/${identifier}`);
        } else {
            // UUID decks require protected API (auth)
            const authToken = await getAuthenticationToken();
            response = await fetch(
                `https://thronesdb.com/api/oauth2/deck/load/${identifier}`,
                { headers: { Authorization: `Bearer ${authToken}` } }
            );
        }
        if (!response.ok) {
            if (response.status === 404) {
                // If deck cannot be found, it should simply return nothing rather than error
                res.status(StatusCodes.OK).json(undefined);
                return;
            }
            throw new Error(`Failed to fetch deck with uuid "${identifier}": ${response.statusText}`);
        }

        const json = await response.json();
        const deck = convertTDBDeck(json);
        res.status(StatusCodes.OK).json(deck);
    })
);

router.get("/card/:code",
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

const REDIS_KEY = "thronesdb_access_token";

async function getAuthenticationToken() {
    const token = await dataService.redis.get(REDIS_KEY);
    if (token && typeof token === "string") {
        return token;
    }

    const response = await fetch("https://thronesdb.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.THRONESDB_CLIENT_ID,
            client_secret: process.env.THRONESDB_CLIENT_SECRET,
            grant_type: "client_credentials"
        })
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch OAuth2 token from ThronesDB: ${response.statusText}`);
    }

    const accessTokenData = await response.json() as OAuthTokenResponse;
    await dataService.redis.set(REDIS_KEY, accessTokenData.access_token, {
        expiration: {
            type: "EX",
            value: accessTokenData.expires_in - 60
        }
    });

    return accessTokenData.access_token;
}

export default router;