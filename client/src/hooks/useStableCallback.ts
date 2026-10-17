import { useCallback, useEffect, useRef } from "react";

// A function whose identity never changes but which always runs the latest one given, so it can be handed to a
// memoised child without that child redrawing for the closure it was made in
export function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
    const callbackRef = useRef(callback);
    useEffect(() => {
        callbackRef.current = callback;
    });
    return useCallback((...args: Args) => callbackRef.current(...args), []);
}
