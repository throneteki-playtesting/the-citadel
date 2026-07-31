import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** State stored against the current history entry rather than the url - for choices which should
 *  survive a back navigation (eg. the tab you were on) without becoming part of a shareable link. */
export default function useHistoryState<T>(key: string, initial: T) {
    const { pathname, search, hash, state } = useLocation();
    const navigate = useNavigate();
    const value = (state?.[key] as T | undefined) ?? initial;

    const setValue = useCallback(
        (next: T) => {
            // Replaces, so the entry we'd return to is the one carrying the choice - a push would
            // instead demand an extra back press for every change
            navigate({ pathname, search, hash }, { replace: true, state: { ...state, [key]: next } });
        },
        [navigate, pathname, search, hash, state, key]
    );

    return [value, setValue] as const;
}
