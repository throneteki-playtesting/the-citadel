import React, {
    Children,
    HTMLAttributes,
    ReactNode,
    Ref,
    TransitionEvent,
    useLayoutEffect,
    useRef,
    useState
} from "react";
import classNames from "classnames";
import { PageActiveContext, useIsPageActive } from "../hooks/useIsPageActive";
import useSlidingPagesHistory from "../hooks/useSlidingPagesHistory";
import { BaseElementProps } from "../types";

/** Lays its children out side by side and slides between them, keeping only the active one's height
 *  so the surrounding page doesn't jump. The Wizard's pages are built on this, without its form handling. */
export default function SlidingPages({
    className,
    style,
    currentPage,
    pageProps,
    history,
    onPageChange,
    children,
    ref
}: SlidingPagesProps) {
    // A page which is the one on show inside something hidden is still not on screen
    const isParentActive = useIsPageActive();
    const activeWrapperRef = useRef<HTMLDivElement>(null);
    const [measuredHeight, setMeasuredHeight] = useState<number>();
    // The height only eases while travelling between pages - on mount, and whenever the page on show
    // resizes by itself, the container is simply the right height
    const [shownPage, setShownPage] = useState(currentPage);
    const [isTravelling, setIsTravelling] = useState(false);
    if (shownPage !== currentPage) {
        setShownPage(currentPage);
        setIsTravelling(true);
    }
    // Counted rather than compared - children are a fresh array every render, and rebuilding the observer
    // each time is the work the observer was there to avoid
    const pageCount = Children.count(children);
    useSlidingPagesHistory(history, currentPage, onPageChange);

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

    // Until the first measurement lands the active page is left in normal flow and the container
    // unclipped, so the container is sized by CSS rather than collapsing around absolute children
    const isMeasured = measuredHeight !== undefined;

    // The pages' own slide finishing is what ends the journey - the height may not change at all
    // between two pages of the same size, so it has no transition of its own to wait on
    const onTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
        const isPageSlide = e.propertyName === "transform" && (e.target as HTMLElement).parentElement === e.currentTarget;
        if (isPageSlide) {
            setIsTravelling(false);
        }
    };

    return (
        <div
            ref={ref}
            className={classNames(
                "relative size-full",
                { "overflow-clip": isMeasured, "transition-height": isTravelling },
                className
            )}
            style={{ ...style, height: isMeasured ? `${measuredHeight}px` : undefined }}
            onTransitionEnd={onTransitionEnd}
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
                        // (see isMeasured) - left in normal flow, it sizes the container itself.
                        className={classNames(
                            "inset-x-0 top-0 w-full transition-transform duration-500 ease-in-out",
                            isActive && !isMeasured ? "relative" : "absolute",
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
} & (
        | {
              /** Records each page change as a browser history entry under this key, for back/forward to travel */
              history: string;
              onPageChange: (page: number) => void;
          }
        | { history?: undefined; onPageChange?: undefined }
    );
