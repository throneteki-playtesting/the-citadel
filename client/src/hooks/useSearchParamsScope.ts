import { createContext, useContext, useEffect } from "react";

export type ScopeParams = Record<string, string | undefined>;
export type ScopeEntry = { isActive: boolean; params: ScopeParams };

/** Set by `ScopedSearchParamsProvider` - split out so this hook doesn't trip react-refresh's one-export rule */
export const ScopedSearchParamsContext = createContext<((id: string, entry: ScopeEntry | null) => void) | null>(
    null
);

/** Registers this component's slice of the url while mounted. Memoize `params` against its source values.
 *  `isActive` false means this scope contributes nothing, so inactive scopes can reuse key names freely. */
export function useSearchParamsScope(id: string, isActive: boolean, params: ScopeParams) {
    const setScope = useContext(ScopedSearchParamsContext);
    if (!setScope) {
        throw new Error("useSearchParamsScope must be used within a ScopedSearchParamsProvider");
    }

    useEffect(() => {
        setScope(id, { isActive, params });
        return () => setScope(id, null);
    }, [id, isActive, params, setScope]);
}
