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
import { ACCESS_TOKEN_COOKIE, OAUTH_STATE_COOKIE, REFRESH_TOKEN_COOKIE, SESSION_ID_COOKIE } from "@/middleware/cookies";
import { determineOnboardingHint, isSafeRelativePath } from "common/utils";
import { OnboardingType } from "common/models/onboarding";

const router = express.Router();

const SCOPES = [
    "identify",
    "guilds",
    "guilds.members.read"
];
const REDIRECT_URL = `${process.env.CLIENT_HOST}/authRedirect`;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

type DiscordAuthQuery = { returnUrl?: string };

router.get("/discord",
    celebrate({
        [Segments.QUERY]: {
            returnUrl: Joi.string().optional()
        }
    }, { allowUnknown: true }),
    asyncHandler<unknown, unknown, unknown, DiscordAuthQuery>(async (req, res) => {
        const { returnUrl } = req.query;
        const safeReturnUrl = returnUrl && isSafeRelativePath(returnUrl) ? returnUrl : undefined;

        const csrf = randomUUID();
        res.cookie(OAUTH_STATE_COOKIE, csrf, {
            httpOnly: true,
            secure: isEnvironment("staging", "production"),
            sameSite: "lax",
            maxAge: OAUTH_STATE_TTL_MS
        });

        const state = Buffer.from(JSON.stringify({ csrf, returnUrl: safeReturnUrl })).toString("base64url");
        const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${process.env.DISCORD_AUTH_REDIRECT}&scope=${SCOPES.join("+")}&state=${state}`;
        res.redirect(encodeURI(discordAuthUrl));
    })
);

type DiscordCallbackQuery = { code?: string, state?: string };

function verifyOAuthState(state: string | undefined, storedCsrf: string | undefined): { valid: boolean, returnUrl?: string } {
    if (!state || !storedCsrf) {
        return { valid: false };
    }
    try {
        const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { csrf?: string, returnUrl?: string };
        if (parsed.csrf !== storedCsrf) {
            return { valid: false };
        }
        return { valid: true, returnUrl: parsed.returnUrl && isSafeRelativePath(parsed.returnUrl) ? parsed.returnUrl : undefined };
    } catch {
        return { valid: false };
    }
}

router.get("/discord/callback",
    celebrate({
        [Segments.QUERY]: {
            code: Joi.string(),
            state: Joi.string()
        }
    }, { allowUnknown: true }),
    asyncHandler<unknown, unknown, unknown, DiscordCallbackQuery>(async (req, res) => {
        try {
            const { code, state } = req.query;

            const storedCsrf = req.cookies[OAUTH_STATE_COOKIE];
            res.clearCookie(OAUTH_STATE_COOKIE);
            const { valid, returnUrl } = verifyOAuthState(state, storedCsrf);

            if (!valid) {
                res.redirect(buildUrl(REDIRECT_URL, { status: "error" } as { status: AuthStatus }));
                return;
            }

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
                onboarding,
                returnUrl
            } as { status: AuthStatus, onboarding?: OnboardingType, returnUrl?: string }));
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

    const accessTokenAge = Number.parseInt(process.env.ACCESS_TOKEN_TTL) * 1000;
    const refreshTokenAge = Number.parseInt(process.env.REFRESH_TOKEN_TTL) * 1000;

    res.cookie(SESSION_ID_COOKIE, sessionId, {
        httpOnly: true,
        secure: isEnvironment("staging", "production"),
        sameSite: "lax",
        maxAge: refreshTokenAge
    });
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
        httpOnly: true,
        secure: isEnvironment("staging", "production"),
        sameSite: "lax",
        maxAge: accessTokenAge
    });
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
        httpOnly: true,
        secure: isEnvironment("staging", "production"),
        sameSite: "lax",
        maxAge: refreshTokenAge
    });
}

export default router;