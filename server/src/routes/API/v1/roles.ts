import { dataService } from "@/services";
import { celebrate, Segments } from "celebrate";
import * as Schemas from "common/models/schemas";
import express from "express";
import asyncHandler from "express-async-handler";
import Permission from "common/models/permissions";
import { validateRequest } from "@/middleware/permissions";
import { StatusCodes } from "http-status-codes";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse } from "@/utils";
import { Role } from "common/models/auth";
import { getRequestSchema } from "@/schemas";

const router = express.Router();

async function getRoles(
    filter: IGetRequest<Role>["filter"],
    orderBy: IGetRequest<Role>["orderBy"],
    page: IGetRequest<Role>["page"],
    perPage: IGetRequest<Role>["perPage"]
): Promise<IGetResponse<Role>> {
    const [result, count] = await Promise.all([
        dataService.roles.read(filter, orderBy, page, perPage),
        dataService.roles.count(filter)
    ]);
    return generateGetResponse(result, count);
}

const getQuerySchema = getRequestSchema(
    Schemas.Role.Full,
    { name: "desc" }
);

const validateGetRoles = [
    validateRequest(Permission.READ_ROLES),
    celebrate({
        [Segments.QUERY]: getQuerySchema
    })
];

// Read roles
router.get("/",
    ...validateGetRoles,
    asyncHandler<unknown, unknown, unknown, IGetRequest<Role>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getRoles(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Update role
router.put("/:discordId",
    celebrate({ [Segments.BODY]: Schemas.Role.Full }),
    asyncHandler<{ discordId: string }, unknown, Role, unknown>(async (req, res) => {
        const { discordId } = req.params;
        const role = req.body;
        // Prevent discordId from being changed
        role.discordId = discordId;

        const result = await dataService.roles.update(role);
        res.status(StatusCodes.OK).json(result);
    })
);

export default router;