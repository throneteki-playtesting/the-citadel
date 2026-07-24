import { celebrate, Joi, Segments } from "@/celebrate";
import express, { Response } from "express";
import asyncHandler from "express-async-handler";
import { dataService, discordService, logger } from "@/services";
import { APIGuildMember, APIUser, RESTPostOAuth2AccessTokenResult } from "discord.js";
import jwt from "jsonwebtoken";
import { buildUrl } from "common/utils";
import { createHash, randomUUID } from "crypto";
import { RefreshToken } from "common/models/auth";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { AccessTokenPayload, AuthStatus, RefreshAuthResponse } from "@/types";
import DiscordService from "@/discord";
import { logActivity } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";
import { isEnvironment } from "@/env";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, SESSION_ID_COOKIE } from "@/middleware/cookies";
import { determineOnboardingHint } from "common/utils";
import { OnboardingType } from "common/models/onboarding";

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

            let discordDetails: APIGuildMember | APIUser | null = null;

            try {
                discordDetails = await get<APIGuildMember>(`users/@me/guilds/${guild.id}/member`, authToken);
            } catch {
                // Not in the guild — fall back to basic profile
                discordDetails = await get<APIUser>("users/@me", authToken);
            }

            // 3. Authenticate discord member/user to user
            const result = await DiscordService.syncUser(discordDetails, true);
            if (!result) {
                res.redirect(buildUrl(REDIRECT_URL, { status: "error" } as { status: AuthStatus }));
                return;
            }
            const { user, isFirstLogin, rolesGained } = result;

            // 4. Creates accessToken & refreshToken, and adds to response as HTTP only cookie
            const sessionId = req.cookies[SESSION_ID_COOKIE] ?? randomUUID();
            await applyTokensToResponse(res, user.discordId, sessionId);

            await logActivity(LogCategory.AUTH, "auth.login", "<principal> logged in", {
                principal: { type: "user", id: user.discordId, displayname: user.displayname, avatarUrl: user.avatarUrl }
            });

            // Picks which onboarding flow (if any) to surface to the client, prioritised by common/models/onboarding
            const onboarding = determineOnboardingHint({ user, isFirstLogin, rolesGained });

            res.redirect(buildUrl(REDIRECT_URL, {
                status: "success",
                onboarding
            } as { status: AuthStatus, onboarding?: OnboardingType }));
        } catch (err) {
            logger.error(err);
            res.redirect(buildUrl(REDIRECT_URL, { status: "error" } as { status: AuthStatus }));
        }
    })
);

router.get("/refresh",
    asyncHandler<unknown, unknown, unknown, unknown>(async (req, res) => {
        const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
        const sessionId = req.cookies[SESSION_ID_COOKIE];
        if (!refreshToken) {
            throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Refresh Token", "No refresh token provided");
        }

        const tokenHash = generateHash(refreshToken);
        const stored = await dataService.auth.popRefreshToken(tokenHash);

        if (!stored || stored.expiresAt < new Date()) {
            throw new ApiErrorResponse(StatusCodes.FORBIDDEN, "Expired or Invalid Refresh Token", "Refresh token is either missing or expired");
        }

        await applyTokensToResponse(res, stored.discordId, sessionId ?? randomUUID());

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
    const expiresAt = new Date(Date.now() + Number.parseInt(process.env.ACCESS_TOKEN_TTL) * 1000);
    const payload: AccessTokenPayload = { discordId, expiresAt };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: Number.parseInt(process.env.ACCESS_TOKEN_TTL) });
    return { token, expiresAt };
}

async function createRefreshToken(discordId: string, sessionId: string) {
    const rawToken = randomUUID();
    const tokenHash = generateHash(rawToken);
    const expiresAt = new Date(Date.now() + Number.parseInt(process.env.REFRESH_TOKEN_TTL) * 1000);
    const createdAt = new Date();
    const refreshToken: RefreshToken = {
        discordId,
        sessionId,
        tokenHash,
        expiresAt,
        createdAt
    };
    await dataService.auth.addRefreshToken(refreshToken);

    return { token: rawToken, expiresAt };
}

function generateHash(raw: string) {
    return createHash("sha256").update(raw).digest("hex");
}

async function applyTokensToResponse(res: Response, discordId: string, sessionId: string) {
    const { token: accessToken } = createAccessToken(discordId);
    const { token: refreshToken } = await createRefreshToken(discordId, sessionId);

    res.cookie(SESSION_ID_COOKIE, sessionId, {
        httpOnly: true,
        secure: isEnvironment("staging", "production"),
        sameSite: "lax"
    });
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
        httpOnly: true,
        secure: isEnvironment("staging", "production"),
        sameSite: "lax"
    });
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
        httpOnly: true,
        secure: isEnvironment("staging", "production"),
        sameSite: "lax"
    });
}

export default router;