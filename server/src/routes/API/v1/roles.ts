import { dataService } from "@/services";
import { celebrate, Segments } from "celebrate";
import * as Schemas from "common/models/schemas";
import express from "express";
import asyncHandler from "express-async-handler";
import { Permission, Role } from "common/models/user";
import { validateRequest } from "@/middleware/permissions";
import { hasPermission } from "common/utils";
import { StatusCodes } from "http-status-codes";
import { orderBy, paging } from "@/schemas";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse } from "@/utils";

const router = express.Router();

const handleGetRoles = [
    validateRequest((user) => hasPermission(user, Permission.READ_ROLES)),
    celebrate({
        [Segments.QUERY]: {
            filter: Schemas.SingleOrArray(Schemas.Role.Partial),
            ...paging(),
            ...orderBy<Role>(Schemas.Role.Full, { name: "asc" })
        }
    }),
    asyncHandler<unknown, unknown, unknown, IGetRequest<Role>>(async (req, res, next) => {
        const { filter, orderBy, page, perPage } = req.query;
        const result = await dataService.users.read(filter, orderBy, page, perPage);
        const count = await dataService.users.count(filter);

        req["response"] = generateGetResponse(result, count);
        next();
    })
];

// Read roles
router.get("/",
    ...handleGetRoles,
    (req, res) => {
        const response = req["response"] as IGetResponse<Role>;
        res.status(StatusCodes.OK).json(response);
    }
);

// Update role
router.put("/:discordId",
    celebrate({
        [Segments.BODY]: Schemas.Role.Full
    }), asyncHandler<{ discordId: string }, unknown, Role, unknown>(async (req, res) => {
        const { discordId } = req.params;
        const role = req.body;
        // Prevent discordId from being changed
        role.discordId = discordId;

        const result = await dataService.roles.update(role);

        res.status(StatusCodes.OK).json(result);
    })
);

export default router;