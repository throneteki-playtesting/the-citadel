import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import { StatusCodes } from "http-status-codes";
import { ApiErrorResponse } from "@/errors";
import { IMPERSONATION_READ_ONLY_ERROR, ImpersonationType } from "common/models/auth";
import { getContext } from "./context";

export interface ImpersonationTokenPayload {
    realDiscordId: string;
    type: ImpersonationType;
    targetId: string;
}

export function signImpersonationToken(payload: ImpersonationTokenPayload): string {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: Number.parseInt(process.env.IMPERSONATION_TOKEN_TTL) });
}

export function verifyImpersonationToken(token: string): ImpersonationTokenPayload | undefined {
    try {
        return jwt.verify(token, process.env.JWT_SECRET) as ImpersonationTokenPayload;
    } catch {
        return undefined;
    }
}

export class ImpersonationReadOnlyErrorResponse extends ApiErrorResponse {
    constructor() {
        super(
            StatusCodes.FORBIDDEN,
            IMPERSONATION_READ_ONLY_ERROR,
            "You're viewing as another role or user and can't make changes. Exit impersonation to continue."
        );
    }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Blocks any mutating request while the session is impersonating a role/user — impersonation is view-only.
export const blockMutationsWhileImpersonating = asyncHandler(async (req, _res, next) => {
    const context = getContext();
    if (context.source === "client" && context.impersonating && !SAFE_METHODS.has(req.method)) {
        throw new ImpersonationReadOnlyErrorResponse();
    }
    next();
});
