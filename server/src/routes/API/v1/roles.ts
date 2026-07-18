import { dataService, discordService } from "@/services";
import { celebrate, Segments } from "@/celebrate";
import * as Schemas from "common/models/schemas";
import express from "express";
import asyncHandler from "express-async-handler";
import Permission from "common/models/permissions";
import { validatePermissionDependencies, validateRequest, validateRolePermissionDependenciesForUsers } from "@/middleware/permissions";
import { StatusCodes } from "http-status-codes";
import { IGetRequest, IGetResponse } from "@/types";
import { generateGetResponse } from "@/utils";
import { Role, User } from "common/models/auth";
import { getRequestSchema } from "@/schemas";
import DiscordService from "@/discord";
import { getContext } from "@/middleware/context";
import { hasPermission } from "common/utils";

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

// Assign the Playtesting Team Discord role to the authenticated user
router.post("/me/playtesting-team",
    validateRequest((principal) =>
        hasPermission(principal, Permission.ASSIGN_OWN_PLAYTESTING_ROLE) && "discordId" in principal
    ),
    asyncHandler(async (_req, res) => {
        const { principal } = getContext();
        const { discordId } = principal as User;

        const member = await discordService.assignPlaytestingTeamRole(discordId);
        if (!member) {
            res.status(StatusCodes.NOT_FOUND).json({ message: "User is not a member of the guild" });
            return;
        }

        const user = await DiscordService.syncUser(member);
        res.status(StatusCodes.OK).json(user);
    })
);

// Update role
router.put("/:discordId",
    validatePermissionDependencies(),
    validateRolePermissionDependenciesForUsers(),
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