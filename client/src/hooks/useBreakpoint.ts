import { BREAKPOINT_WIDTHS, Breakpoint } from "../constants";
import { useMediaQuery } from "./useMediaQuery";

/** Whether the screen is at least as wide as one of Tailwind's sizes - the line its `sm:` and `md:` draw, for choices
 *  markup alone can't make. Follows a rotation or a resize. */
export function useBreakpoint(size: Breakpoint) {
    return useMediaQuery(`(min-width: ${BREAKPOINT_WIDTHS[size]})`);
}
