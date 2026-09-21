import { useLayoutEffect, useState } from "react";
import { useNavigationType } from "react-router-dom";

/** Keeps a comma-separated url param in sync as a string array, reacting only to a genuine navigation
 *  (a click, or browser back/forward) - not this app's own internal REPLACE writes back to the url. */
export function useUrlListFilter(searchParams: URLSearchParams, key: string) {
    const navigationType = useNavigationType();
    const [value, setValue] = useState<string[]>(() => searchParams.get(key)?.split(",").filter(Boolean) ?? []);

    useLayoutEffect(() => {
        if (navigationType === "REPLACE") {
            return;
        }
        const next = searchParams.get(key)?.split(",").filter(Boolean) ?? [];
        setValue((prev) => (prev.length === next.length && prev.every((entry, i) => entry === next[i]) ? prev : next));
    }, [searchParams, navigationType, key]);

    return [value, setValue] as const;
}
