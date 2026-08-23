import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ScopedSearchParamsContext, ScopeEntry } from "../hooks/useSearchParamsScope";

/** Wraps a region whose descendants each own a slice of the url's search params while active (see
 *  `useSearchParamsScope`). One effect sees every scope at once, so an inactive scope can't clear a key a sibling just wrote. */
export default function ScopedSearchParamsProvider({ children }: { children: ReactNode }) {
    const [, setSearchParams] = useSearchParams();
    const { state } = useLocation();
    const stateRef = useRef(state);
    stateRef.current = state;

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

    useEffect(() => {
        const next = new URLSearchParams(window.location.search);
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
        setSearchParams(next, { replace: true, state: stateRef.current });
        // One-way (scopes -> url) deliberately, so this doesn't fight browser back/forward navigation
    }, [scopes, setSearchParams]);

    return <ScopedSearchParamsContext.Provider value={setScope}>{children}</ScopedSearchParamsContext.Provider>;
}
