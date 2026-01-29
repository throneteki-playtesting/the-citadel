import { dataService } from "@/services";
import { celebrate, Joi, Segments } from "celebrate";
import * as Schemas from "common/models/schemas";
import express from "express";
import asyncHandler from "express-async-handler";
import { Permission, User } from "common/models/user";
import { validateRequest } from "@/middleware/permissions";
import { hasPermission } from "common/utils";
import { IGetRequest, IGetResponse } from "@/types";
import { orderBy, paging } from "@/schemas";
import { generateGetResponse } from "@/utils";
import { StatusCodes } from "http-status-codes";

const router = express.Router();

// Authenticate user
router.get("/auth",
    (req, res) => {
        const user = req["user"];
        res.status(StatusCodes.OK).json(user);
    }
);

const handleGetUsers = [
    validateRequest((user) => hasPermission(user, Permission.READ_USERS)),
    celebrate({
        [Segments.QUERY]: {
            filter: Schemas.SingleOrArray(Schemas.User.Partial),
            ...paging(),
            ...orderBy<User>(Schemas.User.Full, { displayname: "asc" })
        }
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<User>>(async (req, res, next) => {
        const { filter, orderBy, page, perPage } = req.query;
        const result = await dataService.users.read(filter, orderBy, page, perPage);
        const count = await dataService.users.count(filter);

        req["response"] = generateGetResponse(result, count);
        next();
    })
];

// Read users
router.get("/",
    ...handleGetUsers,
    (req, res) => {
        const response = req["response"] as IGetResponse<User>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Read user by id
router.get("/:discordId",
    celebrate({
        [Segments.PARAMS]: {
            discordId: Joi.string().required()
        }
    }),
    asyncHandler<{ discordId: string }, unknown, unknown, unknown>(async (req, res) => {
        const { discordId } = req.params;
        const [result] = await dataService.users.read({ discordId });

        res.status(StatusCodes.OK).json(result);
    })
);

// Update user
router.put("/:discordId",
    celebrate({
        [Segments.BODY]: Schemas.User.Full
    }), asyncHandler<{ discordId: string }, unknown, User, unknown>(async (req, res) => {
        const { discordId } = req.params;
        const user = req.body;
        // Prevent discordId from being changed
        user.discordId = discordId;

        const result = await dataService.users.update(user);

        res.status(StatusCodes.OK).json(result);
    })
);

export default router;