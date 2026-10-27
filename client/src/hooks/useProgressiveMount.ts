import { startTransition, useEffect, useState } from "react";

type IdleHandle = { cancel: () => void };

// The browser's idle callback where it has one - Safari doesn't - and otherwise the next task
function whenIdle(callback: () => void): IdleHandle {
    if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(callback, { timeout: 500 });
        return { cancel: () => window.cancelIdleCallback(id) };
    }
    const id = setTimeout(callback, 16);
    return { cancel: () => clearTimeout(id) };
}

/**
 * How many of `count` sections to have built so far - one at first, then one more each time the browser has painted
 * the last and has a moment spare. Each step is a transition, so anything the person does in the meantime (a button
 * press, a keystroke) goes first rather than queueing behind a section they may not even scroll to. Sections are
 * taken in order, so whatever sits highest - what is seen first - arrives first. Starts over from one whenever
 * `resetKey` changes, for when the sections are taken down and put back.
 */
export default function useProgressiveMount(count: number, resetKey?: unknown) {
    const [mounted, setMounted] = useState(1);
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (resetKey !== prevResetKey) {
        setPrevResetKey(resetKey);
        setMounted(1);
    }

    useEffect(() => {
        if (mounted >= count) {
            return;
        }
        const mountNext = () => startTransition(() => setMounted(mounted + 1));
        let idle: IdleHandle | undefined;
        // A frame first, so what was just built is on screen before the next is started
        const frame = requestAnimationFrame(() => {
            idle = whenIdle(mountNext);
        });
        return () => {
            cancelAnimationFrame(frame);
            idle?.cancel();
        };
    }, [mounted, count]);

    return Math.min(mounted, count);
}
