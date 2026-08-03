import { dataService, logger } from "@/services";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { AccessTokenPayload } from "@/types";
import { createHmac, timingSafeEqual } from "crypto";
import { createContext, requestContext } from "./context";
import DiscordService from "@/discord";
import { APIGuildMember, APIUser, GuildMember, User as DiscordUser } from "discord.js";
import { User } from "common/models/auth";
import Permission from "common/models/permissions";
import { hasPermission } from "common/utils";
import { verifyImpersonationToken } from "./impersonation";
import { ACCESS_TOKEN_COOKIE, IMPERSONATION_COOKIE } from "./cookies";

// Resolves the effective principal for a request: the real user, unless a valid impersonation cookie is
// present and the real user still holds the relevant IMPERSONATE_* permission — in which case the effective
// principal becomes the target role (permissions/roles only) or target user (their full principal).
async function resolveImpersonatedPrincipal(
    realUser: User,
    impersonationCookie?: string
): Promise<{ principal: User; impersonating?: "role" | "user" }> {
    if (!impersonationCookie) {
        return { principal: realUser };
    }

    const payload = verifyImpersonationToken(impersonationCookie);
    if (!payload || payload.realDiscordId !== realUser.discordId) {
        return { principal: realUser };
    }

    if (payload.type === "role") {
        if (!hasPermission(realUser, Permission.IMPERSONATE_ROLE)) {
            return { principal: realUser };
        }
        const [role] = await dataService.roles.read({ discordId: payload.targetId });
        if (!role) {
            return { principal: realUser };
        }
        return {
            principal: { ...realUser, permissions: [], roles: [role] },
            impersonating: "role"
        };
    }

    if (!hasPermission(realUser, Permission.IMPERSONATE_USER)) {
        return { principal: realUser };
    }
    const [targetUser] = await dataService.users.read({ discordId: payload.targetId });
    if (!targetUser) {
        return { principal: realUser };
    }
    return {
        principal: { ...targetUser, defaultPermissions: realUser.defaultPermissions },
        impersonating: "user"
    };
}

export const authMiddleware = asyncHandler(async (req, res, next) => {
    if (req.header("Authorization")?.startsWith("Bearer ")) {
        const rawToken = req.header("Authorization").replace("Bearer ", "");

        const integration = await dataService.integrations.findByToken(rawToken);
        if (!integration) {
            logger.warn(`Rejected ${req.method} ${req.originalUrl}: integration token invalid`);
            throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Integration token invalid");
        }

        const context = createContext("api", integration);
        requestContext.run(context, next);
    } else {
        const accessToken = req.cookies[ACCESS_TOKEN_COOKIE];

        if (!accessToken) {
            throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "No session");
        }
        try {
            // `exp` is the signed claim in seconds; the payload's own `expiresAt` survives JSON as a string
            const { discordId, exp } = jwt.verify(accessToken, process.env.JWT_SECRET) as AccessTokenPayload & {
                exp: number;
            };
            const [[user], guestProfile] = await Promise.all([
                dataService.users.read({ discordId }),
                dataService.users.getGuestProfile()
            ]);
            const defaultPermissions = guestProfile
                ? [...new Set([...guestProfile.permissions, ...guestProfile.roles.flatMap((r) => r.permissions)])]
                : [];

            const realUser: User = { ...user, defaultPermissions };
            const { principal, impersonating } = await resolveImpersonatedPrincipal(
                realUser,
                req.cookies[IMPERSONATION_COOKIE]
            );

            const context = createContext(
                "client",
                principal,
                realUser,
                impersonating,
                req.header("X-Client-Id"),
                new Date(exp * 1000)
            );
            requestContext.run(context, next);
        } catch (err) {
            if ("name" in err && err.name === "TokenExpiredError") {
                throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Token Expired");
            }
            throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Token Invalid");
        }
    }
});
export const githubWebhookMiddleware = asyncHandler(async (req, res, next) => {
    const signature = req.headers["x-hub-signature-256"] as string;
    if (!signature) {
        throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Missing signature");
    }

    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const hmac = createHmac("sha256", secret);
    const digest = `sha256=${hmac.update(JSON.stringify(req.body)).digest("hex")}`;

    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
        throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Invalid signature");
    }

    // TODO: Separate Github into its own integration, rather than using internal
    const rawToken = dataService.integrations.fetchInternalToken();
    const integration = await dataService.integrations.findByToken(rawToken);
    if (!integration) {
        throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Invalid signature");
    }

    const context = createContext("webhook", integration);
    requestContext.run(context, next);
});

export const discordCommandMiddleware = async (
    member: APIGuildMember | GuildMember | APIUser | DiscordUser,
    callback: () => void
) => {
    const result = await DiscordService.syncUser(member);
    const context = createContext("api", result?.user);
    requestContext.run(context, callback);
};

export const discordEventMiddleware = async (
    member: APIGuildMember | GuildMember | undefined,
    callback: () => void
) => {
    // TODO: Separate Discord into its own integration, rather than using internal
    const rawToken = dataService.integrations.fetchInternalToken();
    const integration = await dataService.integrations.findByToken(rawToken);
    if (!integration) {
        throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Invalid signature");
    }

    const context = createContext("webhook", integration);
    requestContext.run(context, callback);
};
