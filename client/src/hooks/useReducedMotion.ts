import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Whether the OS is set to minimise animation, so motion-heavy components can snap to their end
 *  state. Follows changes to the setting rather than only reading it on mount. */
export function useReducedMotion() {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(
        () => window.matchMedia(REDUCED_MOTION_QUERY).matches
    );

    useEffect(() => {
        const media = window.matchMedia(REDUCED_MOTION_QUERY);
        const onChange = () => setPrefersReducedMotion(media.matches);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    return prefersReducedMotion;
}
