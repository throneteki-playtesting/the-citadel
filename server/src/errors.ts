import { isCelebrateError } from "celebrate";
import { StatusCodes } from "http-status-codes";
import { logger } from "./services";
import { NextFunction, Request, Response } from "express";
import { ApiError, ApiFieldError, isApiError } from "./types";

export class ApiErrorResponse extends Error implements ApiError {
    constructor(public code: StatusCodes, public error: string, public message: string, public cause?: unknown) {
        super();
    }
}

export const errorHandler = (
    err: Error | ApiError,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: NextFunction
) => {
    // Celebrate error
    if (isCelebrateError(err)) {
        const summary: string[] = [];
        const fields: ApiFieldError[] = [];
        for (const [segment, joiError] of err.details.entries()) {
            const segmentMessages: string[] = [];
            for (const detail of joiError.details) {
                const path = detail.path.join(".");

                segmentMessages.push(path ? `${path} ${detail.message}` : detail.message);
                fields.push({ path, message: detail.message.replace(/^\w/, (c) => c.toUpperCase()) });
            }
            summary.push(`${segment}: ${segmentMessages.join(", ")}`);
        }

        const apiError: ApiError = {
            code: StatusCodes.BAD_REQUEST,
            error: "Validation Error",
            message: summary.join("; "),
            fields
        };

        logger.verbose(`API Validation Error returned: ${JSON.stringify(apiError)}`);
        return res.status(apiError.code).json(apiError);
    }
    // Handled/intentional error response
    if (isApiError(err)) {
        logger.verbose(`API Error Response returned: ${JSON.stringify(err)}`);
        return res.status(err.code).json(err);
    }

    // Unhandled error
    logger.error(err);

    if (process.env.NODE_ENV !== "production") {
        const apiError: ApiError = {
            code: StatusCodes.INTERNAL_SERVER_ERROR,
            error: "Internal Server Error",
            message: err.message
        };
        return res.status(apiError.code).json(apiError);
    }

    // Unhandled error (for production) — same shape as above, without leaking internals
    const apiError: ApiError = {
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        error: "Internal Server Error",
        message: "An internal server error has occurred"
    };
    return res.status(apiError.code).json(apiError);
};