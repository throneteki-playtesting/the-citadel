import { useEffect, useState } from "react";

/** Whether a media query holds, following it as the screen or the user's settings change rather than only reading it
 *  on mount. The base of the hooks which name a query. */
export function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

    useEffect(() => {
        const media = window.matchMedia(query);
        const onChange = () => setMatches(media.matches);
        onChange();
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, [query]);

    return matches;
}
