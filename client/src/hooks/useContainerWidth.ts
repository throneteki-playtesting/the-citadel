import { useCallback, useEffect, useRef, useState } from "react";

/** Tracks the content-box width of the returned ref's element. Uses a callback ref so late-mounting
 *  elements (eg. inside a modal) are observed when they appear, not just on the owner's mount. */
export function useContainerWidth<T extends HTMLElement>() {
    const observerRef = useRef<ResizeObserver | null>(null);
    const [width, setWidth] = useState(0);

    const ref = useCallback((element: T | null) => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        if (element) {
            observerRef.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
            observerRef.current.observe(element);
            setWidth(element.getBoundingClientRect().width);
        }
    }, []);

    useEffect(() => () => observerRef.current?.disconnect(), []);

    return { ref, width };
}
