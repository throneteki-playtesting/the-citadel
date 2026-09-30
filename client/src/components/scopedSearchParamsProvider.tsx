import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ScopedSearchParamsContext, ScopeEntry } from "../hooks/useSearchParamsScope";

/** Wraps a region whose descendants each own a slice of the url's search params while active (see
 *  `useSearchParamsScope`). One effect sees every scope at once, so an inactive scope can't clear a key a sibling just wrote. */
export default function ScopedSearchParamsProvider({ children }: { children: ReactNode }) {
    const [, setSearchParams] = useSearchParams();
    const { state } = useLocation();
    // Read through a ref so a location change alone never rewrites the url - on back/forward the scopes
    // haven't caught up yet, and writing them would put the page just left back into the address bar
    const latestRef = useRef({ setSearchParams, state });
    latestRef.current = { setSearchParams, state };

    const [scopes, setScopes] = useState<Map<string, ScopeEntry>>(() => new Map());

    const setScope = useCallback((id: string, entry: ScopeEntry | null) => {
        setScopes((prev) => {
            const next = new Map(prev);
            if (entry) {
                next.set(id, entry);
            } else {
                next.delete(id);
            }
            return next;
        });
    }, []);

    // Layout effect, so the url settles in the same pass as the scope registrations, before paint
    useLayoutEffect(() => {
        const current = new URLSearchParams(window.location.search);
        const next = new URLSearchParams(current);
        // Cleared first so an inactive scope's key can't retain a stale value
        for (const { params } of scopes.values()) {
            for (const key of Object.keys(params)) {
                next.delete(key);
            }
        }
        for (const { isActive, params } of scopes.values()) {
            if (!isActive) {
                continue;
            }
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) {
                    next.set(key, value);
                }
            }
        }
        if (next.toString() === current.toString()) {
            return;
        }
        latestRef.current.setSearchParams(next, { replace: true, state: latestRef.current.state });
    }, [scopes]);

    return <ScopedSearchParamsContext.Provider value={setScope}>{children}</ScopedSearchParamsContext.Provider>;
}
