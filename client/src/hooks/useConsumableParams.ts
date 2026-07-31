import { useLayoutEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

/** Reads the given params once, then removes them from the url - for params which signal an arrival
 *  (eg. a Discord deep link) rather than durable state. `stateFor` hands them to location state.*/
export default function useConsumableParams<K extends string>(
    keys: readonly K[],
    stateFor?: (values: ConsumedParams<K>) => unknown
) {
    const [searchParams, setSearchParams] = useSearchParams();
    const { state } = useLocation();

    // Captured before the strip below, so consumers keep seeing them for the page's lifetime
    const [values] = useState(
        () => Object.fromEntries(keys.map((key) => [key, searchParams.get(key) ?? undefined])) as ConsumedParams<K>
    );

    // Only the first render's params are an arrival; a later change is someone else's navigation
    const latest = useRef({ keys, searchParams, setSearchParams, stateFor, state });
    latest.current = { keys, searchParams, setSearchParams, stateFor, state };

    // Layout effect, so state lands before children's effects (eg. cycleReleases' collapse defaults) read it
    useLayoutEffect(() => {
        const { keys, searchParams, setSearchParams, stateFor, state } = latest.current;
        if (!keys.some((key) => searchParams.has(key))) {
            return;
        }

        const remaining = new URLSearchParams(searchParams);
        for (const key of keys) {
            remaining.delete(key);
        }
        // Falls back to whatever state the navigation already carried - consuming a param must only
        // ever add to it, never clear a highlight someone else set on the way in
        setSearchParams(remaining, { replace: true, state: stateFor?.(values) ?? state ?? null });
    }, [values]);

    return values;
}

type ConsumedParams<K extends string> = Record<K, string | undefined>;
