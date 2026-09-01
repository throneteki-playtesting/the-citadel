import React, { Children, HTMLAttributes, ReactNode, Ref, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import { PageActiveContext, useIsPageActive } from "../hooks/useIsPageActive";
import { BaseElementProps } from "../types";

/**
 * Lays its children out side by side and slides between them, keeping only the active one's height so
 * the surrounding page doesn't jump. The Wizard's pages are built on this, without its form handling.
 */
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
        const measure = () => setMeasuredHeight(activeWrapperRef.current?.offsetHeight);

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
            className={classNames("relative size-full overflow-clip transition-height", className)}
            style={{ ...style, height: measuredHeight ? `${measuredHeight}px` : undefined }}
        >
            <div
                className="flex flex-row items-start transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${(currentPage - 1) * 100}%)` }}
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
                            className={classNames("flex-shrink-0 w-full", { "overflow-clip": !isActive })}
                            {...pageProps?.(pageNo)}
                        >
                            <PageActiveContext.Provider value={isActive && isParentActive}>
                                {page}
                            </PageActiveContext.Provider>
                        </div>
                    );
                })}
            </div>
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
