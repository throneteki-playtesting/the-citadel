import { ApiErrorResponse } from "@/errors";
import { AsyncLocalStorage } from "async_hooks";
import { User } from "common/models/user";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

export interface RequestContext {
    user: User
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

declare module "express-serve-static-core" {
  interface Request {
    user: User;
  }
}
export function contextMiddleware(req: Request, res: Response, next: NextFunction) {
    const { user } = req;

    if (!user) {
        throw new ApiErrorResponse(StatusCodes.UNAUTHORIZED, "Invalid User", "User not loaded into request context");
    }

    requestContext.run({ user }, next);
}

export function getCurrentUser(): User {
    const store = requestContext.getStore();
    if (!store) throw new Error("No request context found");
    return store.user;
}