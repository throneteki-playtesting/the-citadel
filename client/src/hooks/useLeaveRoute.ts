import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function currentIndex(): number | undefined {
    const index = window.history.state?.idx;
    return typeof index === "number" ? index : undefined;
}

// Leaves the route as if back had been pressed, past every entry pushed since it was arrived at. With nothing
// behind it (the router's `idx` is zero), it lands on `fallback` instead, replacing the page being left.
export default function useLeaveRoute() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    // Per path, not per mount - a route moving from one record to the next (/suggestions/a to /suggestions/b) keeps
    // the same component, and leaving b mustn't also leave a
    const arrivalRef = useRef({ pathname, index: currentIndex() });
    const isLeavingRef = useRef(false);
    if (arrivalRef.current.pathname !== pathname) {
        arrivalRef.current = { pathname, index: currentIndex() };
        // Arrived somewhere new - which may be the same route again, if that is what lay behind
        isLeavingRef.current = false;
    }

    const leave = useCallback(
        (fallback: string) => {
            isLeavingRef.current = true;
            const arrivedAt = arrivalRef.current.index;
            const now = currentIndex();
            if (arrivedAt !== undefined && now !== undefined && arrivedAt > 0) {
                navigate(-(now - arrivedAt + 1));
            } else {
                navigate(fallback, { replace: true });
            }
        },
        [navigate]
    );

    // Read by a page whose own redirects (eg. a record it can no longer find) would otherwise race the leave
    return { leave, isLeavingRef };
}
