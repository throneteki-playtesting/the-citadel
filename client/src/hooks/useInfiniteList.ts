import { startTransition, useCallback, useEffect, useRef, useState } from "react";

// Stands for "no filter has loaded yet" - never equal to any resetKey, undefined included
const NOT_LOADED = Symbol("not loaded");

export interface UseInfiniteListOptions<T> {
    /** Pass the query's `currentData`, not its `data` - `data` keeps showing the previous page's result
     *  while the next page loads, so merging from it would double-add that page for one render. */
    currentData?: { items: T[]; total: number };
    isFetching: boolean;
    /** Whether the *current* page's request ended in an error - stops auto-loading from retrying it */
    isError: boolean;
    page: number;
    onLoadMore: () => void;
    /** Any value whose identity changes when the filter/sort/search changes - triggers a refresh */
    resetKey: unknown;
}

/** Accumulates server pages into one growing list, calling `onLoadMore` when a sentinel scrolls into
 *  view. On a `resetKey` change, previous items stay on screen (caller dims them) until the refresh lands. */
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
    // Which resetKey has received a first response - state set in the same transition as `items`, so no
    // render in between can read "loaded" while the items are still on their way.
    const [loadedResetKey, setLoadedResetKey] = useState<unknown>(NOT_LOADED);
    const hasLoadedCurrentFilter = loadedResetKey === resetKey;
    // Whether ANY filter has loaded, regardless of item count - a zero-result filter must never read
    // as "never loaded", or a later filter landing on zero again would flip back to the full skeleton.
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    // A callback ref, not a plain useRef - the sentinel only mounts once loading finishes, and a plain
    // ref's `.current` changing wouldn't re-run the observer-attaching effect below to notice that.
    const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
    const sentinelRef = useCallback((node: HTMLDivElement | null) => setSentinelNode(node), []);

    const isFetchingRef = useRef(isFetching);
    isFetchingRef.current = isFetching;
    // Once a page errors, auto-loading must stop asking for more, or the observer/top-up effects below
    // would advance straight past the failed page instead of leaving it to be retried.
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
            // A function, so a resetKey which happens to be one is stored rather than called
            setLoadedResetKey(() => resetKey);
            setHasLoadedOnce(true);
        });
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

    return {
        items,
        sentinelRef,
        hasMore: items.length < (total ?? 0),
        isLoadingMore: isFetching && page > 1,
        // A true first-ever load - no filter has ever come back yet, so there's nothing to show at all
        isInitialLoading: !hasLoadedOnce && !hasLoadedCurrentFilter && !isError,
        // The very first page ever requested came back an error, with nothing else to fall back on
        isInitialError: !hasLoadedOnce && !hasLoadedCurrentFilter && isError,
        // A filter change is loading its first page - whatever was on screen before is left in place.
        isRefreshing: hasLoadedOnce && !hasLoadedCurrentFilter && !isError,
        // Same, but the refresh itself failed - whatever was on screen stays up, undimmed, with a retry offered
        isRefreshError: hasLoadedOnce && !hasLoadedCurrentFilter && isError,
        // A later page (beyond the first, already-shown one) came back an error
        isLoadMoreError: hasLoadedCurrentFilter && isError && page > 1
    };
}
