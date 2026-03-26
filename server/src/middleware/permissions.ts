import { ApiErrorResponse } from "@/errors";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import asyncHandler from "express-async-handler";
import { getContext } from "./context";
import { Principal } from "common/models/auth";
import Permission from "common/models/permissions";
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