import { useEffect, useState } from "react";

/**
 * Debounces `value`, and reports `isPending` for the whole window between a change and the debounced
 * value catching up - a caller combines that with its own `isFetching` to keep a spinner alive from the
 * first keystroke through the settled request, not just during the network call.
 */
export default function useDebounce<T>(value: T, delayMs: number): { value: T; isPending: boolean } {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const handle = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(handle);
    }, [value, delayMs]);

    return { value: debounced, isPending: debounced !== value };
}
