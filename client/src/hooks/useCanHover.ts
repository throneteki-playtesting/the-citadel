import { useMediaQuery } from "./useMediaQuery";

const CAN_HOVER_QUERY = "(hover: hover)";

/** Whether the primary input can hover - the line Tailwind's `hover:` draws, for choices markup alone can't
 *  make. Follows a change of input, eg. a tablet docked to a keyboard and trackpad. */
export function useCanHover() {
    return useMediaQuery(CAN_HOVER_QUERY);
}
