import { dataService } from "@/services";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { AccessTokenPayload } from "@/types";
import * as Discord from "discord.js";
import { createHmac, timingSafeEqual } from "crypto";

export const authMiddleware = asyncHandler(
    async (req, res, next) => {
        // TODO: Update to "integration token"
        if (process.env.NODE_ENV === "development" && req.header("Authorization")?.startsWith("Basic")) {
            const encoded = req.header("Authorization").replace("Basic ", "");
            const decoded = Buffer.from(encoded, "base64").toString();
            const [username, password] = decoded.split(":");
            if (username !== process.env.BASIC_USERNAME || password !== process.env.BASIC_PASSWORD) {
                throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Basic credentials are invalid or missing");
            }

            // TODO: Properly add integration as user, rather than using stephen id
            const [user] = await dataService.users.read({ discordId: "120834530801221634" });
            req["user"] = user;
            next();
        } else {
            const { accessToken } = req.cookies;

            if (!accessToken) {
                throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "No access token provided");
            }
            try {
                const { discordId } = jwt.verify(accessToken, process.env.JWT_SECRET) as AccessTokenPayload;
                const [user] = await dataService.users.read({ discordId });
                req["user"] = user;
                next();
            } catch (err) {
                if ("name" in err && err.name === "TokenExpiredError") {
                    throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Token Expired");
                }
                throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Token Invalid");
            }
        }
    }
);

export async function authDiscordUser(member: Discord.APIGuildMember | Discord.GuildMember) {
    const discordUser = member.user;

    let [user] = await dataService.users.read({ discordId: discordUser.id });
    const nickname = discordUser["nick"] ?? discordUser["nickname"];
    if (!user) {
        user = {
            discordId: discordUser.id,
            username: discordUser.username,
            displayname: nickname ?? discordUser.username,
            avatarUrl: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`,
            permissions: [],
            roles: [],
            lastLogin: new Date()
        };
    } else {
        user.username = discordUser.username;
        user.displayname = nickname ?? discordUser.username;
        user.avatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
        user.lastLogin = new Date();
    }
    await dataService.users.update(user);

    return user;
}

export const authGithubWebhook = asyncHandler(
    async (req, res, next) => {
        const signature = req.headers["x-hub-signature-256"] as string;
        if (!signature) {
            res.status(StatusCodes.UNAUTHORIZED).send("Missing signature");
            return;
        }

        const hmac = createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET);
        const digest = `sha256=${hmac.update(JSON.stringify(req.body)).digest("hex")}`;

        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
            res.status(StatusCodes.UNAUTHORIZED).send("Invalid signature");
            return;
        }

        // TODO: When Integrations are implemented, change this to a "GITHUB" integration app, rather than stephens user
        const [user] = await dataService.users.read({ discordId: "120834530801221634" });
        req["user"] = user;

        next();
    });