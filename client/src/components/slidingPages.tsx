import React, { Children, HTMLAttributes, ReactNode, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../types";

/**
 * Lays its children out side by side and slides between them, keeping only the active one's height so
 * the surrounding page doesn't jump. The Wizard's pages are built on this; anywhere else wanting the
 * same "shift across to a new screen" feel can use it directly without taking on the Wizard's form
 * handling, validation or context.
 */
export default function SlidingPages({ className, style, currentPage, pageProps, children }: SlidingPagesProps) {
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
            className={classNames("relative w-full overflow-hidden transition-height", className)}
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
                    return (
                        <div
                            key={pageNo}
                            ref={pageNo === currentPage ? activeWrapperRef : null}
                            aria-hidden={pageNo !== currentPage}
                            inert={pageNo !== currentPage}
                            className="flex-shrink-0 w-full"
                            {...pageProps?.(pageNo)}
                        >
                            {page}
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
};
