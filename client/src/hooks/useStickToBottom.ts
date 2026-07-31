import { useCallback, useEffect, useRef } from "react";

// How far off the bottom still counts as being at it, covering sub-pixel scroll heights
const PINNED_THRESHOLD_PX = 24;

function findScrollParent(element: HTMLElement) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const { overflowY } = getComputedStyle(parent);
        if (overflowY === "auto" || overflowY === "scroll") {
            return parent;
        }
    }
    return null;
}

/** Keeps the scrollable ancestor of the returned ref's element pinned to the bottom as that element
 *  grows, until the reader scrolls away from it themselves. Uses a callback ref so late-mounting
 *  elements (eg. inside a modal) are observed when they appear, not just on the owner's mount. */
export function useStickToBottom<T extends HTMLElement>() {
    const containerRef = useRef<HTMLElement | null>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const isPinnedRef = useRef(true);

    const onScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        isPinnedRef.current = distanceFromBottom <= PINNED_THRESHOLD_PX;
    }, []);

    const detach = useCallback(() => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        containerRef.current?.removeEventListener("scroll", onScroll);
        containerRef.current = null;
    }, [onScroll]);

    const ref = useCallback(
        (element: T | null) => {
            detach();
            if (!element) {
                return;
            }
            containerRef.current = findScrollParent(element);
            isPinnedRef.current = true;
            containerRef.current?.addEventListener("scroll", onScroll, { passive: true });
            // Follows the growth frame by frame while a section animates open, rather than jumping at the end
            observerRef.current = new ResizeObserver(() => {
                const container = containerRef.current;
                if (container && isPinnedRef.current) {
                    container.scrollTop = container.scrollHeight;
                }
            });
            observerRef.current.observe(element);
        },
        [detach, onScroll]
    );

    useEffect(() => detach, [detach]);

    return ref;
}
