import classNames from "classnames";
import { Key, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import type { IGetRequest, IGetResponse } from "server/types";
import { BaseElementProps } from "../types";
import LoadingCard from "./loadingCard";
import useInfiniteList from "../hooks/useInfiniteList";
import { reorderTransition } from "../constants";

type Size = "sm" | "md" | "lg";

function columnsClassNameFor(size: Size): string {
    switch (size) {
        case "sm":
            return "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6";
        case "md":
            return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
        case "lg":
            return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
    }
}

function defaultLoadingCountFor(size: Size): number {
    switch (size) {
        case "sm":
            return 4;
        case "md":
            return 3;
        case "lg":
            return 2;
    }
}

type CardGridBaseProps<T> = Omit<BaseElementProps, "children"> & {
    size?: Size;
    children: (card: T, index: number) => ReactNode;
    /** Opts into AnimatePresence + a reorder transition per card - off by default (matches every
     *  pre-existing CardGrid usage, which rolls its own or has no reordering to animate at all) */
    animate?: boolean;
    /** Stable identity per card for the reorder animation - only meaningful when `animate` is set;
     *  falls back to index, which defeats animation but is a safe (static-list) default otherwise */
    keyExtractor?: (card: T, index: number) => Key;
};

// The grid of actual cards (or their animated wrappers) - shared between flat and query mode
function CardGridContent<T>({
    cards,
    renderMapFunc,
    size = "md",
    className,
    style,
    animate,
    keyExtractor = (_card, index) => index
}: Pick<CardGridBaseProps<T>, "size" | "className" | "style" | "animate" | "keyExtractor"> & {
    cards: T[];
    renderMapFunc: (card: T, index: number) => ReactNode;
}) {
    const columnsClassName = columnsClassNameFor(size);
    const content = animate ? (
        <AnimatePresence initial={false} mode="popLayout">
            {cards.map((card, index) => (
                <motion.div
                    key={keyExtractor(card, index)}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={reorderTransition}
                >
                    {renderMapFunc(card, index)}
                </motion.div>
            ))}
        </AnimatePresence>
    ) : (
        cards.map(renderMapFunc)
    );
    return (
        <div className={classNames("grid gap-1", columnsClassName, className)} style={style}>
            {content}
        </div>
    );
}

// The icon+message+Retry trio shared by all three error states below - each wraps it in its own layout
function ErrorNotice({ message, onRetry }: { message: ReactNode; onRetry: () => void }) {
    return (
        <>
            <div className="flex items-center gap-2 text-sm text-default-400">
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-danger" />
                {message}
            </div>
            <Button size="sm" variant="flat" onPress={onRetry}>
                Retry
            </Button>
        </>
    );
}

function LoadingGrid({
    size = "md",
    count,
    className,
    style
}: {
    size?: Size;
    count: number;
    className?: string;
    style?: BaseElementProps["style"];
}) {
    return (
        <div className={classNames("grid gap-1", columnsClassNameFor(size), className)} style={style}>
            {Array.from({ length: count }).map((_, index) => (
                <LoadingCard key={index} />
            ))}
        </div>
    );
}

// -- Flat mode: caller already has the data (or its own loading state) - unchanged from before --

type CardGridFlatProps<T> = CardGridBaseProps<T> & {
    cards?: T[];
    isLoading?: boolean;
    loadingCount?: number;
    query?: undefined;
};

function FlatCardGrid<T>({
    cards = [],
    size = "md",
    children: renderMapFunc,
    className,
    style,
    isLoading,
    loadingCount,
    animate,
    keyExtractor
}: CardGridFlatProps<T>) {
    if (isLoading) {
        return (
            <LoadingGrid
                size={size}
                count={loadingCount ?? defaultLoadingCountFor(size)}
                className={className}
                style={style}
            />
        );
    }
    return (
        <CardGridContent
            cards={cards}
            renderMapFunc={renderMapFunc}
            size={size}
            className={className}
            style={style}
            animate={animate}
            keyExtractor={keyExtractor}
        />
    );
}

// -- Query mode: CardGrid owns fetching, paging, accumulation and the loading/error/empty states --

type CardGridQueryResult<T> = {
    currentData?: IGetResponse<T>;
    isFetching: boolean;
    isError: boolean;
    refetch: () => void;
};

export type CardGridQueryState<T> = {
    items: T[];
    isInitialLoading: boolean;
    isRefreshing: boolean;
    isFetching: boolean;
};

type CardGridQueryProps<T> = CardGridBaseProps<T> & {
    cards?: undefined;
    isLoading?: undefined;
    loadingCount?: undefined;
    /** An RTK Query hook (eg. `useGetSuggestionsQuery`) - called directly, page/perPage injected */
    query: (arg: IGetRequest<T>) => CardGridQueryResult<T>;
    queryArgs?: Omit<IGetRequest<T>, "page" | "perPage">;
    perPage: number;
    /**
     * Extra value(s), beyond `queryArgs`, that should also reset pagination back to page 1 when they
     * change - eg. a query param `query` itself closes over but which isn't part of `queryArgs` (the
     * suggestions endpoint's `unseen`/`myReactions`, resolved server-side rather than via the generic
     * filter). Most callers won't need this - `queryArgs` alone drives the reset key by default.
     */
    resetKey?: unknown;
    emptyContent?: ReactNode;
    errorContent?: ReactNode;
    endContent?: ReactNode;
    /** Mirrors this grid's own loaded items/loading state back to the caller - for a header (search
     *  spinner, filter option lists) that needs to react to data this component now owns internally */
    onStateChange?: (state: CardGridQueryState<T>) => void;
};

function QueryCardGrid<T>({
    query,
    queryArgs,
    perPage,
    resetKey: extraResetKey,
    size = "md",
    children: renderMapFunc,
    className,
    style,
    animate,
    keyExtractor,
    emptyContent,
    errorContent,
    endContent,
    onStateChange
}: CardGridQueryProps<T>) {
    const resetKey = useMemo(
        () => JSON.stringify({ queryArgs: queryArgs ?? {}, extraResetKey }),
        [queryArgs, extraResetKey]
    );

    const [page, setPage] = useState(1);
    useEffect(() => {
        setPage(1);
    }, [resetKey]);

    const { currentData, isFetching, isError, refetch } = query({
        ...(queryArgs as IGetRequest<T>),
        page,
        perPage
    });

    const {
        items,
        sentinelRef,
        hasMore,
        isLoadingMore,
        isInitialLoading,
        isInitialError,
        isRefreshing,
        isRefreshError,
        isLoadMoreError
    } = useInfiniteList<T>({
        currentData,
        isFetching,
        isError,
        page,
        onLoadMore: () => setPage((prev) => prev + 1),
        resetKey
    });

    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;
    useEffect(() => {
        onStateChangeRef.current?.({ items, isInitialLoading, isRefreshing, isFetching });
    }, [items, isInitialLoading, isRefreshing, isFetching]);

    if (isInitialLoading) {
        return <LoadingGrid size={size} count={perPage} className={className} style={style} />;
    }

    if (isInitialError) {
        return (
            <div className="p-8 flex flex-col items-center gap-2 text-center">
                <ErrorNotice message={errorContent ?? "Something went wrong loading this data."} onRetry={refetch} />
            </div>
        );
    }

    if (items.length === 0) {
        return <div className="p-8 text-center text-default-400">{emptyContent ?? "Nothing to show."}</div>;
    }

    return (
        <div className="flex flex-col gap-2">
            {isRefreshError && (
                <div className="flex items-center justify-center gap-2">
                    <ErrorNotice
                        message={errorContent ?? "Something went wrong refreshing this data."}
                        onRetry={refetch}
                    />
                </div>
            )}
            {/* A refresh (filter/sort/search change) dims the still-showing previous results rather than
                swapping to a skeleton - matches the project card grid's own convention (see projectContent.tsx) */}
            <div className={classNames("flex flex-col gap-2 transition-opacity", { "opacity-50 pointer-events-none": isRefreshing })}>
                <CardGridContent
                    cards={items}
                    renderMapFunc={renderMapFunc}
                    size={size}
                    className={className}
                    style={style}
                    animate={animate}
                    keyExtractor={keyExtractor}
                />
                {isLoadMoreError ? (
                    <div className="py-4 flex flex-col items-center gap-2 text-center">
                        <ErrorNotice message="Couldn’t load more." onRetry={refetch} />
                    </div>
                ) : hasMore ? (
                    <div ref={sentinelRef} className="flex justify-center py-4">
                        {isLoadingMore && <Spinner size="sm" aria-label="Loading more" />}
                    </div>
                ) : (
                    endContent && <div className="py-4 text-center text-xs text-default-400">{endContent}</div>
                )}
            </div>
        </div>
    );
}

export type CardGridProps<T> = CardGridFlatProps<T> | CardGridQueryProps<T>;

// Dispatches to one of two internal components rather than branching within a single one - a component
// can't itself conditionally call hooks (useState/useInfiniteList/`query`) between renders, but swapping
// which component renders at this position is exactly what React's element-type reconciliation supports.
const CardGrid = function <T>(props: CardGridProps<T>) {
    if (props.query) {
        return <QueryCardGrid {...props} />;
    }
    return <FlatCardGrid {...props} />;
};

export default CardGrid;
