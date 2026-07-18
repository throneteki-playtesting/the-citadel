import { FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { addToast } from "@heroui/react";
import { StatusCodes } from "http-status-codes";
import type { ApiError, ApiFieldError } from "server/types";

export type ErrorKind = "validation" | "unauthorized" | "permission" | "notFound" | "businessRule" | "conflict" | "unknown";

export type NormalizedError = {
    kind: ErrorKind;
    status: number;
    error: string;
    message: string;
    fields?: ApiFieldError[];
};

function kindForStatus(status: number): ErrorKind {
    switch (status) {
        case StatusCodes.BAD_REQUEST: return "validation";
        case StatusCodes.UNAUTHORIZED: return "unauthorized";
        case StatusCodes.FORBIDDEN: return "permission";
        case StatusCodes.NOT_FOUND: return "notFound";
        case StatusCodes.NOT_ACCEPTABLE: return "businessRule";
        case StatusCodes.CONFLICT: return "conflict";
        default: return "unknown";
    }
}

function isApiErrorBody(data: unknown): data is ApiError {
    return !!data && typeof data === "object" && "code" in data && "error" in data && "message" in data;
}

function isNormalizedErrorBody(data: unknown): data is NormalizedError {
    return !!data && typeof data === "object" && "kind" in data && "status" in data && "message" in data;
}

export function toNormalizedError(error: unknown): NormalizedError {
    const fetchError = error as FetchBaseQueryError | undefined;

    if (fetchError && typeof fetchError.status === "number") {
        const status = fetchError.status;

        // Already normalized (eg. by baseQueryWithReauth) — pass through rather than reinterpreting the body
        if (isNormalizedErrorBody(fetchError.data)) {
            return fetchError.data;
        }

        if (isApiErrorBody(fetchError.data)) {
            return { kind: kindForStatus(status), status, error: fetchError.data.error, message: fetchError.data.message, fields: fetchError.data.fields };
        }
        return { kind: kindForStatus(status), status, error: "Unknown Error", message: "An unknown error has occurred" };
    }

    // FETCH_ERROR / PARSING_ERROR / TIMEOUT_ERROR / CUSTOM_ERROR, or a non-RTK-Query error
    return { kind: "unknown", status: 0, error: "Unknown Error", message: "An unknown error has occurred" };
}

export function getErrorMessage(error: unknown): string {
    return toNormalizedError(error).message;
}

const ToastErrorMapping: Record<ErrorKind, (normalized: NormalizedError) => { title: string, description: string }> = {
    validation: (normalized) => ({ title: "Invalid Data", description: normalized.message }),
    unauthorized: () => ({ title: "Not Signed In", description: "You must be signed in to perform this action" }),
    permission: () => ({ title: "Access Denied", description: "You do not have permission to perform this action" }),
    notFound: (normalized) => ({ title: "Not Found", description: normalized.message }),
    businessRule: (normalized) => ({ title: "Action Not Allowed", description: normalized.message }),
    conflict: (normalized) => ({ title: "Already Exists", description: normalized.message }),
    unknown: () => ({ title: "Failed to Save", description: "An unknown error has occurred" })
};

export function showApiErrorToast(error: unknown, overrides?: Partial<Parameters<typeof addToast>[0]>) {
    const normalized = toNormalizedError(error);
    const { title, description } = ToastErrorMapping[normalized.kind](normalized);
    addToast({ title, color: "danger", description, ...overrides });
}
