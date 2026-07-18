import { dataService, discordService } from "@/services";
import { celebrate, Joi, Segments } from "@/celebrate";
import * as Schemas from "common/models/schemas";
import express from "express";
import asyncHandler from "express-async-handler";
import Permission from "common/models/permissions";
import { validatePermissionDependencies, validateRequest } from "@/middleware/permissions";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse } from "@/utils";
import { StatusCodes } from "http-status-codes";
import { getContext } from "@/middleware/context";
import { User } from "common/models/auth";
import { getRequestSchema } from "@/schemas";
import DiscordService from "@/discord";
import { hasPermission } from "common/utils";

const router = express.Router();

async function getUsers(
    filter: IGetRequest<User>["filter"],
    orderBy: IGetRequest<User>["orderBy"],
    page: IGetRequest<User>["page"],
    perPage: IGetRequest<User>["perPage"]
): Promise<IGetResponse<User>> {
    const [result, count] = await Promise.all([
        dataService.users.read(filter, orderBy, page, perPage),
        dataService.users.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(
    Schemas.User.Full,
    { displayname: "asc" }
);

// Fetch current user (for client)
router.get("/me",
    (_req, res) => {
        const { source, principal } = getContext();
        const user: User = source === "client" ? principal : null;
        res.status(StatusCodes.OK).json(user);
    }
);

// Read users
router.get("/",
    validateRequest(Permission.READ_USERS),
    celebrate({ [Segments.QUERY]: getQuerySchema }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<User>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getUsers(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read user by discordId
router.get("/:discordId",
    validateRequest((principal) => hasPermission(principal, Permission.READ_USER) || hasPermission(principal, Permission.READ_USERS)),
    celebrate({ [Segments.PARAMS]: { discordId: Joi.string().required() } }),
    asyncHandler<{ discordId: string }, unknown, unknown, unknown>(async (req, res) => {
        const { discordId } = req.params;
        let [user] = await dataService.users.read({ discordId });

        // Attempt to fetch user's discord Id and build their data from there
        if (!user) {
            const guild = await discordService.getGuild();
            const discordUser = await discordService.findMemberOrUserById(guild, discordId);
            if (discordUser) {
                user = await DiscordService.syncUser(discordUser);
            }
        }

        res.status(StatusCodes.OK).json(user);
    })
);

// Update user
router.put("/:discordId",
    validateRequest(Permission.EDIT_USERS),
    validatePermissionDependencies(),
    celebrate({ [Segments.BODY]: Schemas.User.Full }),
    asyncHandler<{ discordId: string }, unknown, User, unknown>(async (req, res) => {
        const { discordId } = req.params;
        const user = req.body;
        // Prevent discordId from being changed
        user.discordId = discordId;

        const result = await dataService.users.update(user);
        if (discordId === "anonymous") {
            dataService.users.invalidateGuestProfileCache();
        }
        res.status(StatusCodes.OK).json(result);
    })
);

export default router;