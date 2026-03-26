import { dataService } from "@/services";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import { AccessTokenPayload } from "@/types";
import { createHmac, timingSafeEqual } from "crypto";
import { createContext, requestContext } from "./context";
import DiscordService from "@/discord";
import { APIGuildMember, GuildMember } from "discord.js";

export const authMiddleware = asyncHandler(
    async (req, res, next) => {
        if (req.header("Authorization")?.startsWith("Bearer ")) {
            const rawToken = req.header("Authorization").replace("Bearer ", "");

            const integration = await dataService.integrations.findByToken(rawToken);
            if (!integration) {
                throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Integration token invalid");
            }

            const context = createContext("api", integration);
            requestContext.run(context, next);
        } else {
            const { accessToken } = req.cookies;

            if (!accessToken) {
                throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "No access token provided");
            }
            try {
                const { discordId } = jwt.verify(accessToken, process.env.JWT_SECRET) as AccessTokenPayload;
                const [user] = await dataService.users.read({ discordId });

                const context = createContext("client", user);
                requestContext.run(context, next);
            } catch (err) {
                if ("name" in err && err.name === "TokenExpiredError") {
                    throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Token Expired");
                }
                throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Token Invalid");
            }
        }
    }
);
export const githubWebhookMiddleware = asyncHandler(
    async (req, res, next) => {
        const signature = req.headers["x-hub-signature-256"] as string;
        if (!signature) {
            throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Missing signature");
        }

        const rawToken = process.env.GITHUB_WEBHOOK_SECRET;
        const hmac = createHmac("sha256", rawToken);
        const digest = `sha256=${hmac.update(JSON.stringify(req.body)).digest("hex")}`;

        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
            throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Invalid signature");
        }

        const integration = await dataService.integrations.findByToken(rawToken);
        if (!integration) {
            throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid Authentication", "Invalid signature");
        }

        const context = createContext("webhook", integration);
        requestContext.run(context, next);
    }
);

export const discordCommandMiddleware = async (member: APIGuildMember | GuildMember, callback: () => void) => {
    const user = await DiscordService.getUserFromMember(member);
    const context = createContext("api", user);
    requestContext.run(context, callback);
};