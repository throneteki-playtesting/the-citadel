import { useEffect } from "react";
import api from "../api";
import { store } from "../api/store";
import { refreshSession } from "../api/refresh";

// Fraction of the token's remaining life to wait, leaving room for the request plus a retry or two
const REFRESH_AT = 0.75;
const MIN_DELAY_MS = 1000;

export function useProactiveRefresh() {
    const { data: user } = api.useGetMeQuery();
    const expiresAt = user?.accessTokenExpiresAt;

    useEffect(() => {
        if (!expiresAt) {
            return;
        }

        const remaining = new Date(expiresAt).getTime() - Date.now();
        if (remaining <= 0) {
            return;
        }

        const timer = setTimeout(
            async () => {
                const outcome = await refreshSession();
                if (outcome === "refreshed" || outcome === "concurrent") {
                    // Picks up the new expiry, which reschedules this effect for the next cycle
                    store.dispatch(api.util.invalidateTags([{ type: "me" }]));
                }
            },
            Math.max(MIN_DELAY_MS, remaining * REFRESH_AT)
        );

        return () => clearTimeout(timer);
    }, [expiresAt]);
}
