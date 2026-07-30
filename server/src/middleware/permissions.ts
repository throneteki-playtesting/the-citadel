import { ApiErrorResponse } from "@/errors";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import asyncHandler from "express-async-handler";
import { getContext } from "./context";
import { Principal, Role } from "common/models/auth";
import Permission from "common/models/permissions";
import { permissionMeta } from "common/models/permissions";
import { asArray, hasPermission } from "common/utils";
import { IProject } from "common/models/projects";
import { dataService } from "@/services";

export class PermissionErrorResponse extends ApiErrorResponse {
    constructor() {
        super(StatusCodes.FORBIDDEN, "Access Denied", "Insufficient permissions to perform this action");
    }
}

export function validateRequest<A, B, C, D>(
    validate:
        | ((principal: Principal, req: Request<A, B, C, D>, res: Response) => boolean | Promise<boolean>)
        | Permission
        | Permission[]
) {
    return asyncHandler<A, B, C, D>(async (req, res, next) => {
        const { principal } = getContext();
        let isValid = false;
        if (typeof validate === "function") {
            isValid = await validate(principal, req, res);
        } else {
            const permissions = asArray(validate);
            isValid = hasPermission(principal, ...permissions);
        }
        if (!isValid) {
            throw new PermissionErrorResponse();
        }
        next();
    });
}

export const validateProjectAccess = asyncHandler<unknown, unknown, unknown, unknown>(async (_req, res, next) => {
    const { principal } = getContext();
    const project = res.locals.project as IProject;

    if (
        project.active
            ? !hasPermission(principal, Permission.READ_PROJECTS)
            : !hasPermission(principal, Permission.READ_ARCHIVED_PROJECTS)
    ) {
        throw new PermissionErrorResponse();
    }
    next();
});

// Reverse map: permission -> all permissions that declare it as a dependency
const reverseDependencyMap = new Map<Permission, Permission[]>();
for (const [permission, { dependencies }] of Object.entries(permissionMeta) as [
    Permission,
    { dependencies?: Permission | Permission[] }
][]) {
    if (!dependencies) continue;
    const normalized = Array.isArray(dependencies) ? dependencies : [dependencies];
    for (const dep of normalized) {
        if (!reverseDependencyMap.has(dep)) reverseDependencyMap.set(dep, []);
        reverseDependencyMap.get(dep)!.push(permission);
    }
}

export function validatePermissionDependencies() {
    return asyncHandler<unknown, unknown, Principal | Role, unknown>(async (req, _res, next) => {
        const { permissions } = req.body;
        if (!permissions || !Array.isArray(permissions)) {
            return next();
        }

        const permissionSet = new Set<Permission>(permissions);
        const effectivePermissions = new Set<Permission>([...permissions]);

        // For Principal updates, include permissions granted by roles so dependency checks don't
        // require explicitly adding a permission that is already covered by a role.
        if ("roles" in req.body) {
            const { roles } = req.body;
            const rolePermissions = roles?.flatMap((r) => r.permissions) ?? [];
            rolePermissions.forEach((rolePermission) => effectivePermissions.add(rolePermission));
        }

        const errors: string[] = [];

        // Cannot add a permission without its dependencies
        for (const [permission, { dependencies }] of Object.entries(permissionMeta) as [
            Permission,
            { dependencies?: Permission | Permission[] }
        ][]) {
            if (!permissionSet.has(permission) || !dependencies) continue;
            const required = Array.isArray(dependencies) ? dependencies : [dependencies];
            const missing = required.filter((dep) => !effectivePermissions.has(dep));
            for (const dep of missing) {
                errors.push(`Cannot grant ${permission} without also granting ${dep}`);
            }
        }

        // Cannot remove a permission that another granted permission depends on
        for (const [dep, dependents] of reverseDependencyMap) {
            if (effectivePermissions.has(dep)) continue;
            const blocking = dependents.filter((p) => effectivePermissions.has(p));
            for (const blocker of blocking) {
                errors.push(`Cannot remove ${dep} while ${blocker} is still granted`);
            }
        }

        if (errors.length > 0) {
            throw new ApiErrorResponse(StatusCodes.UNPROCESSABLE_ENTITY, "Invalid Permissions", errors.join("; "));
        }

        next();
    });
}

export function validateRolePermissionDependenciesForUsers() {
    return asyncHandler<{ discordId: string }, unknown, Role, unknown>(async (req, _res, next) => {
        const { discordId } = req.params;
        const { permissions: newPermissions } = req.body;
        if (!newPermissions || !Array.isArray(newPermissions)) {
            return next();
        }

        const updatedRolePermissions = new Set<Permission>(newPermissions);
        const affectedUsers = await dataService.users.read({ "roles.discordId": discordId } as never);
        const errors: string[] = [];

        for (const user of affectedUsers) {
            const effectivePermissions = new Set<Permission>(user.permissions);
            for (const role of user.roles) {
                const rolePermissions = role.discordId === discordId ? updatedRolePermissions : role.permissions;
                for (const permission of rolePermissions) effectivePermissions.add(permission);
            }

            for (const [permission, { dependencies }] of Object.entries(permissionMeta) as [
                Permission,
                { dependencies?: Permission | Permission[] }
            ][]) {
                if (!user.permissions.includes(permission) || !dependencies) continue;
                const required = Array.isArray(dependencies) ? dependencies : [dependencies];
                const missing = required.filter((dep) => !effectivePermissions.has(dep));
                for (const dep of missing) {
                    errors.push(
                        `Cannot remove ${dep} from role while ${user.displayname} still requires it for ${permission}`
                    );
                }
            }
        }

        if (errors.length > 0) {
            throw new ApiErrorResponse(StatusCodes.UNPROCESSABLE_ENTITY, "Invalid Permissions", errors.join("; "));
        }

        next();
    });
}
