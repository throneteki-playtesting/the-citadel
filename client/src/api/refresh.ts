import { Mutex } from "async-mutex";
import { StatusCodes } from "http-status-codes";
import type { RefreshAuthResponse } from "server/types";

export type RefreshOutcome = "refreshed" | "concurrent" | "expired" | "failed";

const mutex = new Mutex();

const RETRY_DELAYS_MS = [300, 900];

// Only a server-stated dead session is final; anything else says nothing about it, so it retries
async function attemptRefresh(): Promise<RefreshOutcome> {
    try {
        const response = await fetch("/auth/refresh", { credentials: "include" });
        if (response.status === StatusCodes.FORBIDDEN || response.status === StatusCodes.UNAUTHORIZED) {
            return "expired";
        }
        if (!response.ok) {
            return "failed";
        }

        const result = (await response.json()) as RefreshAuthResponse;
        return result.status === "success" ? "refreshed" : "failed";
    } catch {
        return "failed";
    }
}

export async function refreshSession(): Promise<RefreshOutcome> {
    if (mutex.isLocked()) {
        await mutex.waitForUnlock();
        return "concurrent";
    }

    return await mutex.runExclusive(async (): Promise<RefreshOutcome> => {
        let outcome = await attemptRefresh();

        for (const delay of RETRY_DELAYS_MS) {
            if (outcome !== "failed") {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
            outcome = await attemptRefresh();
        }

        return outcome;
    });
}
