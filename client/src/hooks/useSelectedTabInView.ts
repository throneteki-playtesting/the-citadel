import { useEffect, useRef } from "react";

/**
 * Keeps the chosen tab on screen. HeroUI only scrolls a tab into view when that tab itself is clicked, so a
 * selection moved any other way - an arrow, a swipe, the url on arrival - has to be brought in by hand.
 */
export function useSelectedTabInView(selected: unknown) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        ref.current
            ?.querySelector('[role="tab"][aria-selected="true"]')
            ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }, [selected]);

    return ref;
}

// The classNames every scrollable tab list shares - `base` is the one that makes the scrolling work
export const scrollableTabs = { base: "w-full" } as const;
