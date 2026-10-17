import { useMediaQuery } from "./useMediaQuery";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Whether the OS is set to minimise animation, so motion-heavy components can snap to their end
 *  state. Follows changes to the setting rather than only reading it on mount. */
export function useReducedMotion() {
    return useMediaQuery(REDUCED_MOTION_QUERY);
}
