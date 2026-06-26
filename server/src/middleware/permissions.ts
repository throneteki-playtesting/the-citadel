import { ApiErrorResponse } from "@/errors";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import asyncHandler from "express-async-handler";
import { getContext } from "./context";
import { Principal } from "common/models/auth";
import Permission from "common/models/permissions";
import { permissionMeta } from "common/models/permissions";
import { asArray, hasPermission } from "common/utils";

export function validateRequest<A, B, C, D>(validate: ((principal: Principal, req: Request<A, B, C, D>, res: Response) => boolean | Promise<boolean>) | Permission | Permission[]) {
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
            throw new ApiErrorResponse(StatusCodes.FORBIDDEN, "Access Denied", "User has insufficient permissions to perform this action");
        }
        next();
    });
}

// Reverse map: permission -> all permissions that declare it as a dependency
const reverseDependencyMap = new Map<Permission, Permission[]>();
for (const [permission, { dependencies }] of Object.entries(permissionMeta) as [Permission, { dependencies?: Permission | Permission[] }][]) {
    if (!dependencies) continue;
    const normalized = Array.isArray(dependencies) ? dependencies : [dependencies];
    for (const dep of normalized) {
        if (!reverseDependencyMap.has(dep)) reverseDependencyMap.set(dep, []);
        reverseDependencyMap.get(dep)!.push(permission);
    }
}

export function validatePermissionDependencies() {
    return asyncHandler(async (req, _res, next) => {
        const permissions: Permission[] | undefined = req.body?.permissions;
        if (!permissions || !Array.isArray(permissions)) {
            return next();
        }

        const permissionSet = new Set<Permission>(permissions);
        const errors: string[] = [];

        // Cannot add a permission without its dependencies
        for (const [permission, { dependencies }] of Object.entries(permissionMeta) as [Permission, { dependencies?: Permission | Permission[] }][]) {
            if (!permissionSet.has(permission) || !dependencies) continue;
            const required = Array.isArray(dependencies) ? dependencies : [dependencies];
            const missing = required.filter(dep => !permissionSet.has(dep));
            for (const dep of missing) {
                errors.push(`Cannot grant ${permission} without also granting ${dep}`);
            }
        }

        // Cannot remove a permission that another granted permission depends on
        for (const [dep, dependents] of reverseDependencyMap) {
            if (permissionSet.has(dep)) continue;
            const blocking = dependents.filter(p => permissionSet.has(p));
            for (const blocker of blocking) {
                errors.push(`Cannot remove ${dep} while ${blocker} is still granted`);
            }
        }

        if (errors.length > 0) {
            throw new ApiErrorResponse(
                StatusCodes.UNPROCESSABLE_ENTITY,
                "Invalid Permissions",
                errors.join("; ")
            );
        }

        next();
    });
}