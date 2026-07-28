import { Mutex } from "async-mutex";
import { StatusCodes } from "http-status-codes";
import { isSafeRelativePath } from "common/utils";
import type { RefreshAuthResponse } from "server/types";

export type RefreshOutcome = "refreshed" | "concurrent" | "expired" | "failed";

const mutex = new Mutex();

export async function refreshSession(): Promise<RefreshOutcome> {
    if (mutex.isLocked()) {
        await mutex.waitForUnlock();
        return "concurrent";
    }

    return await mutex.runExclusive(async (): Promise<RefreshOutcome> => {
        try {
            const response = await fetch("/auth/refresh", { credentials: "include" });
            if (response.status === StatusCodes.FORBIDDEN) {
                return "expired";
            }
            if (!response.ok) {
                return "failed";
            }

            const result = await response.json() as RefreshAuthResponse;
            return result.status === "success" ? "refreshed" : "failed";
        } catch {
            return "failed";
        }
    });
}

export function redirectToLogin() {
    const returnUrl = window.location.pathname + window.location.search;
    window.location.href = returnUrl !== "/" && isSafeRelativePath(returnUrl) ? `/auth/discord?returnUrl=${encodeURIComponent(returnUrl)}` : "/auth/discord";
}
