import { configureStore, isRejectedWithValue, Middleware } from "@reduxjs/toolkit";
import { addToast } from "@heroui/react";
import api from ".";
import auth from "./authSlice";
import thronesdbApi from "./thronesdb";
import { isImpersonationReadOnlyError } from "./errors";

// Temporary solution to at least see errors coming in.
// This should be replaced with a more clear-intended method of:
// 1. Determining if the incoming error was an "ApiResponseError" (typeguard it)
// 2. Otherwise, package the oncoming error in such a way to ensure its type safe for try/catch blocks
const errorLoggerMiddleware: Middleware = () => (next) => (action) => {
    if (isRejectedWithValue(action)) {
        console.error("API Error (Rejected Value):", action.payload);

        // Surface this everywhere, regardless of whether the call site handles/toasts its own errors,
        // since it can otherwise look like a silent failure while impersonating.
        if (isImpersonationReadOnlyError(action.payload)) {
            addToast({
                title: "Read-Only (Impersonating)",
                color: "warning",
                description: "You're viewing as another role or user — exit impersonation to make changes"
            });
        }
    }

    if (typeof action === "object" && action !== null && "type" in action) {
        if ((action as { type: string }).type.endsWith("/rejected")) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errorAction = action as { error?: { name?: string; message?: string }; payload?: any };

            if (errorAction.error?.name === "ConditionError") {
                return next(action);
            }

            const message = errorAction.payload?.message || errorAction.error?.message || "Unknown Error";

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            console.error(`Global Error Handler [${(action as any).type}]:`, message);
        }
    }

    return next(action);
};
export const store = configureStore({
    reducer: {
        auth,
        [api.reducerPath]: api.reducer,
        [thronesdbApi.reducerPath]: thronesdbApi.reducer
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(errorLoggerMiddleware).concat(api.middleware).concat(thronesdbApi.middleware)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
