import React, { Children, HTMLAttributes, ReactNode, Ref, useEffect, useLayoutEffect, useRef, useState } from "react";
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
    // Before the first measurement, the container can't be trusted to have a correct height from JS
    // alone - so until then the active page is left in normal flow (not absolute) instead, which sizes
    // the container by pure CSS on whatever the first painted frame turns out to be, and the container
    // itself isn't clipped, so even a wrong guess here leaves content visible rather than hidden. Both
    // relax back to the measured/absolute/clipped steady state together once a real measurement lands.
    const [hasMeasuredOnce, setHasMeasuredOnce] = useState(false);
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

    // Deliberately a render behind measuredHeight, via a plain (not layout) effect - flipping this in
    // the same commit as the first real height would add "transition-height" at the same moment the
    // container's height first goes from unmeasured to real, and the browser then animates that jump
    // from its actual previous (collapsed) state, regardless of the class only just having arrived.
    // Waiting one extra paint means the frame this lands on already shows the correct height (put there
    // by the active page's own normal-flow layout, not by this state), so there's nothing left to ease.
    useEffect(() => {
        if (measuredHeight !== undefined) {
            setHasMeasuredOnce(true);
        }
    }, [measuredHeight]);

    return (
        <div
            ref={ref}
            className={classNames(
                "relative size-full",
                { "overflow-clip transition-height": hasMeasuredOnce },
                className
            )}
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
                        // page's height before snapping down once the active page's was measured. The
                        // active page is the one exception, and only until that first measurement lands
                        // (see hasMeasuredOnce) - left in normal flow, it sizes the container itself.
                        className={classNames(
                            "inset-x-0 top-0 w-full transition-transform duration-500 ease-in-out",
                            isActive && !hasMeasuredOnce ? "relative" : "absolute",
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
