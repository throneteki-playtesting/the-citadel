import { useEffect, useState } from "react";

const CAN_HOVER_QUERY = "(hover: hover)";

/** Whether the primary input can hover - the line Tailwind's `hover:` draws, for choices markup alone can't
 *  make. Follows a change of input, eg. a tablet docked to a keyboard and trackpad. */
export function useCanHover() {
    const [canHover, setCanHover] = useState(() => window.matchMedia(CAN_HOVER_QUERY).matches);

    useEffect(() => {
        const media = window.matchMedia(CAN_HOVER_QUERY);
        const onChange = () => setCanHover(media.matches);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    return canHover;
}
