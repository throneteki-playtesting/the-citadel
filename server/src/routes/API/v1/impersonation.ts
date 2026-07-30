import express from "express";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { PermissionErrorResponse } from "@/middleware/permissions";
import { getContext } from "@/middleware/context";
import { signImpersonationToken } from "@/middleware/impersonation";
import { IMPERSONATION_COOKIE, impersonationCookieOptions } from "@/middleware/cookies";
import { dataService } from "@/services";
import Permission from "common/models/permissions";
import { hasPermission } from "common/utils";
import { logActivity, roleSnapshot, userSnapshot } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";
import { MeResponse } from "common/models/auth";

const router = express.Router();

// Impersonation permission checks must always run against the real, logged-in principal — never the
// (potentially impersonated) effective principal — so requests are resolved through the client context directly.
function getClientContext() {
    const context = getContext();
    if (context.source !== "client") {
        throw new PermissionErrorResponse();
    }
    return context;
}

router.post(
    "/role/:roleId",
    asyncHandler<{ roleId: string }, MeResponse, unknown, unknown>(async (req, res) => {
        const { realPrincipal: realUser, impersonating } = getClientContext();
        if (impersonating) {
            throw new ApiErrorResponse(
                StatusCodes.CONFLICT,
                "Already Impersonating",
                "Exit your current impersonation before starting a new one"
            );
        }
        if (!hasPermission(realUser, Permission.IMPERSONATE_ROLE)) {
            throw new PermissionErrorResponse();
        }

        const { roleId } = req.params;
        const [role] = await dataService.roles.read({ discordId: roleId });
        if (!role) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", "Role does not exist");
        }

        const token = signImpersonationToken({
            realDiscordId: realUser.discordId,
            type: "role",
            targetId: role.discordId
        });
        res.cookie(IMPERSONATION_COOKIE, token, impersonationCookieOptions);

        await logActivity(LogCategory.AUTH, "auth.impersonate.start", "<principal> started impersonating role <role>", {
            principal: {
                type: "user",
                id: realUser.discordId,
                displayname: realUser.displayname,
                avatarUrl: realUser.avatarUrl
            },
            context: { role: roleSnapshot(role) }
        });

        const response: MeResponse = {
            ...realUser,
            permissions: [],
            roles: [role],
            impersonation: {
                type: "role",
                target: { id: role.discordId, name: role.name, color: role.color },
                realUser: { id: realUser.discordId, name: realUser.displayname, avatarUrl: realUser.avatarUrl }
            }
        };
        res.status(StatusCodes.OK).json(response);
    })
);

router.post(
    "/user/:discordId",
    asyncHandler<{ discordId: string }, MeResponse, unknown, unknown>(async (req, res) => {
        const { realPrincipal: realUser, impersonating } = getClientContext();
        if (impersonating) {
            throw new ApiErrorResponse(
                StatusCodes.CONFLICT,
                "Already Impersonating",
                "Exit your current impersonation before starting a new one"
            );
        }
        if (!hasPermission(realUser, Permission.IMPERSONATE_USER)) {
            throw new PermissionErrorResponse();
        }

        const { discordId } = req.params;
        if (discordId === realUser.discordId) {
            throw new ApiErrorResponse(
                StatusCodes.UNPROCESSABLE_ENTITY,
                "Invalid Target",
                "You cannot impersonate yourself"
            );
        }
        const [targetUser] = await dataService.users.read({ discordId });
        if (!targetUser) {
            throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", "User does not exist");
        }

        const token = signImpersonationToken({
            realDiscordId: realUser.discordId,
            type: "user",
            targetId: targetUser.discordId
        });
        res.cookie(IMPERSONATION_COOKIE, token, impersonationCookieOptions);

        await logActivity(
            LogCategory.AUTH,
            "auth.impersonate.start",
            "<principal> started impersonating <targetUser>",
            {
                principal: {
                    type: "user",
                    id: realUser.discordId,
                    displayname: realUser.displayname,
                    avatarUrl: realUser.avatarUrl
                },
                context: { targetUser: userSnapshot(targetUser) }
            }
        );

        const response: MeResponse = {
            ...targetUser,
            defaultPermissions: realUser.defaultPermissions,
            impersonation: {
                type: "user",
                target: { id: targetUser.discordId, name: targetUser.displayname, avatarUrl: targetUser.avatarUrl },
                realUser: { id: realUser.discordId, name: realUser.displayname, avatarUrl: realUser.avatarUrl }
            }
        };
        res.status(StatusCodes.OK).json(response);
    })
);

router.post(
    "/stop",
    asyncHandler<unknown, MeResponse, unknown, unknown>(async (_req, res) => {
        const { realPrincipal: realUser, impersonating } = getClientContext();

        res.clearCookie(IMPERSONATION_COOKIE, impersonationCookieOptions);

        if (impersonating) {
            await logActivity(LogCategory.AUTH, "auth.impersonate.stop", "<principal> stopped impersonating", {
                principal: {
                    type: "user",
                    id: realUser.discordId,
                    displayname: realUser.displayname,
                    avatarUrl: realUser.avatarUrl
                }
            });
        }

        const response: MeResponse = { ...realUser };
        res.status(StatusCodes.OK).json(response);
    })
);

export default router;
