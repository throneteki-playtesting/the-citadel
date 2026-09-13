import React, { Children, HTMLAttributes, ReactNode, Ref, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import { PageActiveContext, useIsPageActive } from "../hooks/useIsPageActive";
import { BaseElementProps } from "../types";

/** Lays its children out side by side and slides between them, keeping only the active one's height
 *  so the surrounding page doesn't jump. The Wizard's pages are built on this, without its form handling. */
export default function SlidingPages({ className, style, currentPage, pageProps, children, ref }: SlidingPagesProps) {
    // A page which is the one on show inside something hidden is still not on screen
    const isParentActive = useIsPageActive();
    const activeWrapperRef = useRef<HTMLDivElement>(null);
    const [measuredHeight, setMeasuredHeight] = useState<number>();
    // Counted rather than compared - children are a fresh array every render, and rebuilding the observer
    // each time is the work the observer was there to avoid
    const pageCount = Children.count(children);

    // Watches the active page rather than measuring once - pages can grow after mount, and a stale
    // height would either clip them or leave a gap underneath
    useLayoutEffect(() => {
        // `?? undefined`, not `||` - a genuinely-collapsed page (offsetHeight 0, eg. mid-remeasure)
        // must still count as "measured", or the container's explicit height gets un-set instead.
        const measure = () => setMeasuredHeight(activeWrapperRef.current?.offsetHeight ?? undefined);

        measure();

        const activePage = activeWrapperRef.current;
        if (!activePage || typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(measure);
        observer.observe(activePage);
        return () => observer.disconnect();
    }, [currentPage, pageCount]);

    return (
        <div
            ref={ref}
            className={classNames("relative size-full overflow-clip", className)}
            style={{ ...style, height: measuredHeight !== undefined ? `${measuredHeight}px` : undefined }}
        >
            {Children.map(children, (page, index) => {
                if (!React.isValidElement(page)) {
                    return page;
                }
                const pageNo = index + 1;
                const isActive = pageNo === currentPage;
                return (
                    <div
                        key={pageNo}
                        ref={isActive ? activeWrapperRef : null}
                        aria-hidden={!isActive}
                        inert={!isActive}
                        // Absolutely positioned, not a flex sibling - a flex row flashed the tallest
                        // page's height before snapping down once the active page's was measured.
                        className={classNames(
                            "absolute inset-x-0 top-0 w-full transition-transform duration-500 ease-in-out",
                            { "overflow-clip": !isActive }
                        )}
                        style={{ transform: `translateX(${(pageNo - currentPage) * 100}%)` }}
                        {...pageProps?.(pageNo)}
                    >
                        <PageActiveContext.Provider value={isActive && isParentActive}>
                            {page}
                        </PageActiveContext.Provider>
                    </div>
                );
            })}
        </div>
    );
}

type SlidingPagesProps = Omit<BaseElementProps, "children"> & {
    /** 1-based index of the page on show */
    currentPage: number;
    /** Extra props for each page's wrapper, eg. the Wizard's page marker attribute */
    pageProps?: (pageNo: number) => HTMLAttributes<HTMLDivElement>;
    children: ReactNode;
    ref?: Ref<HTMLDivElement>;
};
