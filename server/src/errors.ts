import { isCelebrateError } from "celebrate";
import { StatusCodes } from "http-status-codes";
import { logger } from "./services";
import { NextFunction, Request, Response } from "express";
import { ApiError, isApiError } from "./types";

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
        const details: string[] = [];
        for (const [segment, joiError] of err.details.entries()) {
            details.push(`${segment}: ${joiError.message}`);
        }

        const apiError: ApiError = {
            code: StatusCodes.BAD_REQUEST,
            error: "Validation Error",
            message: details.join("; ")
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
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            name: err.name,
            message: err.message,
            cause: err.cause,
            stack: err.stack
        });
    }

    // Unhandled error (for production)
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
};