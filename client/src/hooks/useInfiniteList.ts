import { startTransition, useCallback, useEffect, useRef, useState } from "react";

export interface UseInfiniteListOptions<T> {
    /**
     * Pass the query's `currentData`, not its `data` - RTK Query's `data` intentionally keeps showing the
     * *previous* page's result while a new page argument is loading (to avoid a flicker to empty), so
     * merging from it double-adds the previous page for the one render before the real page arrives.
     * `currentData` is undefined until the result for the current args has actually landed.
     */
    currentData?: { items: T[]; total: number };
    isFetching: boolean;
    /** Whether the *current* page's request ended in an error - stops auto-loading from retrying it */
    isError: boolean;
    page: number;
    onLoadMore: () => void;
    /** Any value whose identity changes when the filter/sort/search changes - triggers a refresh */
    resetKey: unknown;
}

/**
 * Accumulates server pages into one growing list, calling `onLoadMore` when a sentinel element scrolls
 * into view. Mirrors admin/logs' own IntersectionObserver pattern, generalized for reuse - paging state
 * itself stays with the caller (it owns the query), this only owns accumulation/observing.
 *
 * On a `resetKey` change, the previously-loaded items are deliberately NOT cleared - they stay on screen
 * (the caller dims them, matching the project card grid's own convention) until the refreshed first page
 * actually lands, at which point they're replaced outright. Only a true first-ever load (nothing to keep
 * showing) has no choice but a skeleton.
 */
export default function useInfiniteList<T>({
    currentData,
    isFetching,
    isError,
    page,
    onLoadMore,
    resetKey
}: UseInfiniteListOptions<T>) {
    const [items, setItems] = useState<T[]>([]);
    // Tracked separately from currentData.total - currentData itself goes back to undefined while the
    // next page is loading, but `hasMore` needs to keep answering from the last total actually seen.
    const [total, setTotal] = useState<number>();
    // Which resetKey we've actually received a first successful response for - used instead of an
    // isFetching/items-length heuristic for "is this filter's data current". A brand new RTK Query cache
    // key (eg. right after a filter change) doesn't necessarily flip isFetching to true on the very same
    // render it appears in, so that heuristic could read "not fetching" for one render before the real
    // request state catches up.
    const loadedResetKeyRef = useRef<unknown>(undefined);
    const hasLoadedCurrentFilter = loadedResetKeyRef.current === resetKey;

    // A callback ref (not a plain useRef) - the sentinel only exists in the DOM once loading finishes
    // (it's hidden behind the initial skeleton), so the observer-attaching effect below needs to
    // re-run once that actually happens. A plain ref's `.current` changing doesn't trigger a re-render
    // or re-run any effect, so that mount would otherwise go unnoticed and the observer would never attach.
    const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
    const sentinelRef = useCallback((node: HTMLDivElement | null) => setSentinelNode(node), []);

    const isFetchingRef = useRef(isFetching);
    isFetchingRef.current = isFetching;
    // Once a page errors, auto-loading must stop asking for more - otherwise the observer/top-up effects
    // below would keep firing (isFetching goes back to false once the failed request settles) and advance
    // straight past the failed page to the next one, silently dropping it rather than retrying it.
    const isErrorRef = useRef(isError);
    isErrorRef.current = isError;
    const itemsLengthRef = useRef(items.length);
    itemsLengthRef.current = items.length;
    const totalRef = useRef(total);
    totalRef.current = total;
    const onLoadMoreRef = useRef(onLoadMore);
    onLoadMoreRef.current = onLoadMore;

    useEffect(() => {
        if (!currentData) {
            return;
        }
        // A transition lets urgent updates (eg. typing) interrupt/deprioritize this expensive re-render.
        startTransition(() => {
            // Replaces (not appends) on page 1 - this is what actually swaps stale items for fresh ones
            // once a refresh's first page lands, since nothing clears `items` up front any more.
            setItems((prev) => (page === 1 ? currentData.items : [...prev, ...currentData.items]));
            setTotal(currentData.total);
        });
        loadedResetKeyRef.current = resetKey;
    }, [currentData, page, resetKey]);

    // Loads the next page once the bottom sentinel scrolls into view
    useEffect(() => {
        if (!sentinelNode) {
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (
                    entries[0].isIntersecting &&
                    !isFetchingRef.current &&
                    !isErrorRef.current &&
                    itemsLengthRef.current < (totalRef.current ?? 0)
                ) {
                    onLoadMoreRef.current();
                }
            },
            { threshold: 0 }
        );
        observer.observe(sentinelNode);
        return () => observer.disconnect();
    }, [sentinelNode]);

    // Tops up with another page if the sentinel is still visible after one lands (a short page, tall screen)
    useEffect(() => {
        if (isFetchingRef.current || isErrorRef.current || items.length >= (total ?? 0) || !sentinelNode) {
            return;
        }
        const rect = sentinelNode.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        if (isVisible) {
            onLoadMoreRef.current();
        }
    }, [items, total, sentinelNode]);

    const hasItems = items.length > 0;

    return {
        items,
        sentinelRef,
        hasMore: items.length < (total ?? 0),
        isLoadingMore: isFetching && page > 1,
        // A true first-ever load - nothing to show at all yet, and not because it just failed
        isInitialLoading: !hasLoadedCurrentFilter && !isError && !hasItems,
        // The very first page of this filter came back an error, with nothing else to fall back on
        isInitialError: !hasLoadedCurrentFilter && isError && !hasItems,
        // A filter/sort/search change is loading its first page while stale items from the previous one
        // are still on screen - the caller dims them rather than swapping to a skeleton
        isRefreshing: !hasLoadedCurrentFilter && !isError && hasItems,
        // Same, but the refresh itself failed - the stale items stay up, undimmed, with a retry offered
        isRefreshError: !hasLoadedCurrentFilter && isError && hasItems,
        // A later page (beyond the first, already-shown one) came back an error
        isLoadMoreError: hasLoadedCurrentFilter && isError && page > 1
    };
}
