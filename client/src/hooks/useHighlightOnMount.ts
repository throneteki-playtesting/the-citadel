import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Draws attention to whatever this is attached to, once, on arrival - via router state
 * (`state.highlight`, for navigating to a target on another page) or `force` (a same-page target).
 */
export default function useHighlightOnMount<T extends HTMLElement>(targetId: string, force = false) {
    const { pathname, search, hash, state } = useLocation();
    const navigate = useNavigate();
    const ref = useRef<T | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Fires once per request rather than once per mount - StrictMode runs mount effects twice, and a
    // target which re-highlighted on every render of a standing `force` would never settle
    const hasFired = useRef(false);
    const [isHighlighted, setIsHighlighted] = useState(false);

    useEffect(() => {
        const isRequested = force || state?.highlight === targetId;
        if (!isRequested) {
            hasFired.current = false;
            return;
        }
        if (hasFired.current || !ref.current) {
            return;
        }
        hasFired.current = true;

        ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
        setIsHighlighted(true);

        timerRef.current = setTimeout(() => setIsHighlighted(false), 2500);

        if (state?.highlight === targetId) {
            const remaining = { ...state };
            delete remaining.highlight;
            navigate({ pathname, search, hash }, { replace: true, state: remaining });
        }
    }, [state, targetId, force, navigate, pathname, search, hash]);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    return { ref: ref as React.RefObject<T>, isHighlighted };
}
