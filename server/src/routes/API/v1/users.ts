import { dataService } from "@/services";
import { celebrate, Joi, Segments } from "celebrate";
import * as Schemas from "common/models/schemas";
import express from "express";
import asyncHandler from "express-async-handler";
import Permission from "common/models/permissions";
import { validateRequest } from "@/middleware/permissions";
import { IGetRequest, IGetResponse } from "@/types";
import { orderBy, paging } from "@/schemas";
import { generateGetResponse } from "@/utils";
import { StatusCodes } from "http-status-codes";
import { getContext } from "@/middleware/context";
import { User } from "common/models/auth";

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

const validateGetUsers = [
    validateRequest(Permission.READ_USERS),
    celebrate({
        [Segments.QUERY]: {
            filter: Schemas.SingleOrArray(Schemas.User.Partial),
            ...paging(),
            ...orderBy<User>(Schemas.User.Full, { displayname: "asc" })
        }
    })
];

// Fetch current user (for client)
router.get("/me",
    (req, res) => {
        const { source, principal } = getContext();
        let user: User = null;
        if (source === "client") {
            user = principal;
        }
        res.status(StatusCodes.OK).json(user);
    }
);

// Read users
router.get("/",
    ...validateGetUsers,
    asyncHandler<unknown, unknown, unknown, IGetRequest<User>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getUsers(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Read user by discordId
router.get("/:discordId",
    celebrate({ [Segments.PARAMS]: { discordId: Joi.string().required() } }),
    asyncHandler<{ discordId: string }, unknown, unknown, unknown>(async (req, res) => {
        const { discordId } = req.params;
        const [result] = await dataService.users.read({ discordId });
        res.status(StatusCodes.OK).json(result);
    })
);

// Update user
router.put("/:discordId",
    celebrate({ [Segments.BODY]: Schemas.User.Full }),
    asyncHandler<{ discordId: string }, unknown, User, unknown>(async (req, res) => {
        const { discordId } = req.params;
        const user = req.body;
        // Prevent discordId from being changed
        user.discordId = discordId;

        const result = await dataService.users.update(user);
        res.status(StatusCodes.OK).json(result);
    })
);

export default router;