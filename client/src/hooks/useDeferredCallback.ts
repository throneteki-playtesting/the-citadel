import { useCallback, useEffect, useRef } from "react";

/** Long enough to swallow a held key's repeat rate, short enough that nothing feels detached */
const DEFAULT_DELAY = 200;

// Runs `callback` at most once per `delay` while work keeps arriving. For the editors, where the cost of
// a keystroke is serialising the document upward - and `flush` on blur is what keeps a deferral safe
export function useDeferredCallback(callback: () => void, delay: number = DEFAULT_DELAY) {
    const callbackRef = useRef(callback);
    useEffect(() => {
        callbackRef.current = callback;
    });

    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const isPending = useRef(false);

    const flush = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = undefined;
        }
        if (!isPending.current) {
            return;
        }
        isPending.current = false;
        callbackRef.current();
    }, []);

    const schedule = useCallback(() => {
        isPending.current = true;
        // Trailing edge of a fixed window rather than a restarting one, so held keys still report in
        if (!timer.current) {
            timer.current = setTimeout(flush, delay);
        }
    }, [delay, flush]);

    // Whatever is still pending belongs to the value being edited, not to this component's lifetime
    useEffect(() => flush, [flush]);

    return { schedule, flush };
}
