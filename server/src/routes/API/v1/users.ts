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

const handleGetUsers = [
    validateRequest(Permission.READ_USERS),
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