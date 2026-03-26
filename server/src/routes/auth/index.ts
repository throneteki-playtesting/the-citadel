import { celebrate, Joi, Segments } from "celebrate";
import express, { Response } from "express";
import asyncHandler from "express-async-handler";
import { dataService, discordService, logger } from "@/services";
import { APIGuildMember, RESTPostOAuth2AccessTokenResult } from "discord.js";
import jwt from "jsonwebtoken";
import { buildUrl } from "common/utils";
import { createHash, randomUUID } from "crypto";
import { RefreshToken } from "common/models/auth";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { AccessTokenPayload, AuthStatus, RefreshAuthResponse } from "@/types";
import DiscordService from "@/discord";

const router = express.Router();

const SCOPES = [
    "identify",
    "guilds",
    "guilds.members.read"
];
const DISCORD_AUTH_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${process.env.DISCORD_AUTH_REDIRECT}&scope=${SCOPES.join("+")}`;
const REDIRECT_URL = `${process.env.CLIENT_HOST}/authRedirect`;

router.get("/discord", (req, res) => {
    res.redirect(encodeURI(DISCORD_AUTH_URL));
});

type DiscordCallbackQuery = { code?: string };

router.get("/discord/callback",
    celebrate({
        [Segments.QUERY]: {
            code: Joi.string()
        }
    }, { allowUnknown: true }),
    asyncHandler<unknown, unknown, unknown, DiscordCallbackQuery>(async (req, res) => {
        try {
            const { code } = req.query;

            if (!code) {
                res.redirect(buildUrl(REDIRECT_URL, { status: "cancelled" } as { status: AuthStatus }));
                return;
            }
            // 1. Get Access Token
            const authToken = await getAuthenticationToken(code);

            // 2. Fetch discord user & member info
            const guild = await discordService.getGuild();
            const discordMember = await get<APIGuildMember>(`users/@me/guilds/${guild.id}/member`, authToken);

            // 3. Authenticate discord member to user
            const user = await DiscordService.getUserFromMember(discordMember);

            // 4. Creates accessToken & refreshToken, and adds to response as HTTP only cookie
            await applyTokensToResponse(res, user.discordId);

            res.redirect(buildUrl(REDIRECT_URL, { status: "success" } as { status: AuthStatus }));
        } catch (err) {
            logger.error(err);
            res.redirect(buildUrl(REDIRECT_URL, { status: "error" } as { status: AuthStatus }));
        }
    })
);

router.get("/refresh",
    asyncHandler<unknown, unknown, unknown, unknown>(async (req, res) => {
        const { refreshToken } = req.cookies;
        if (!refreshToken) {
            throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Refresh Token", "No refresh token provided");
        }

        const tokenHash = generateHash(refreshToken);
        const stored = await dataService.auth.popRefreshToken(tokenHash);

        if (!stored || stored.expiresAt < new Date()) {
            throw new ApiErrorResponse(StatusCodes.FORBIDDEN, "Expired or Invalid Refresh Token", "Refresh token is either missing or expired");
        }

        await applyTokensToResponse(res, stored.discordId);

        const response: RefreshAuthResponse = { status: "success" };
        res.json(response);
    })
);

// Helper functions
async function getAuthenticationToken(code: string) {
    const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code,
            redirect_uri: process.env.DISCORD_AUTH_REDIRECT
        })
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch OAuth2 token from Discord: ${response.statusText}`);
    }

    const accessTokenData = await response.json() as RESTPostOAuth2AccessTokenResult;

    return `${accessTokenData.token_type} ${accessTokenData.access_token}`;
}

async function get<T>(url: string, authToken: string) {
    const response = await fetch(
        `https://discord.com/api/${url}`,
        { headers: { Authorization: authToken } }
    );
    if (!response.ok) {
        throw new Error(`Failed Discord request: ${response.statusText}`);
    }

    return response.json() as T;
}

function createAccessToken(discordId: string) {
    const payload: AccessTokenPayload = {
        discordId,
        expiresAt: new Date(Date.now() + Number.parseInt(process.env.ACCESS_TOKEN_TTL) * 1000)
    };
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        {
            expiresIn: Number.parseInt(process.env.ACCESS_TOKEN_TTL)
        }
    );
}

async function createRefreshToken(discordId: string) {
    const rawToken = randomUUID();
    const tokenHash = generateHash(rawToken);
    const expiresAt = new Date(Date.now() + Number.parseInt(process.env.REFRESH_TOKEN_TTL) * 1000);
    const createdAt = new Date();
    const refreshToken: RefreshToken = {
        discordId,
        tokenHash,
        expiresAt,
        createdAt
    };
    await dataService.auth.addRefreshToken(refreshToken);

    return rawToken;
}

function generateHash(raw: string) {
    return createHash("sha256").update(raw).digest("hex");
}

async function applyTokensToResponse(res: Response, discordId: string) {
    const accessToken = createAccessToken(discordId);
    const refreshToken = await createRefreshToken(discordId);

    res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    });
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    });
}

export default router;