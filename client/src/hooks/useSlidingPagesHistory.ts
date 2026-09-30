import { useEffect, useRef } from "react";

type EntryPage = { page: number; path: string };

// Keyed by the router's `idx` - the one part of an entry's state a replace never rewrites
const storageKey = (key: string) => `sliding-pages:${key}`;

function readEntries(key: string): Record<number, EntryPage> {
    try {
        return JSON.parse(sessionStorage.getItem(storageKey(key)) ?? "{}");
    } catch {
        return {};
    }
}

function writeEntry(key: string, index: number, page: number) {
    try {
        const entries = readEntries(key);
        entries[index] = { page, path: window.location.pathname };
        sessionStorage.setItem(storageKey(key), JSON.stringify(entries));
    } catch {
        // Without storage, back/forward just leave the page where it is
    }
}

// The path guards against a position the browser has since handed to a different page
function entryPage(key: string, index: number) {
    const entry = readEntries(key)[index];
    return entry?.path === window.location.pathname ? entry.page : undefined;
}

function currentIndex(): number | undefined {
    const index = window.history.state?.idx;
    return typeof index === "number" ? index : undefined;
}

export default function useSlidingPagesHistory(
    key: string | undefined,
    currentPage: number,
    onPageChange: ((page: number) => void) | undefined
) {
    const syncedPageRef = useRef(currentPage);
    const onPageChangeRef = useRef(onPageChange);
    onPageChangeRef.current = onPageChange;
    // Only entries recorded while mounted - storage can't tell whether the entry behind is still this page's
    const ownPagesRef = useRef(new Map<number, number>());

    useEffect(() => {
        const index = currentIndex();
        if (!key || index === undefined) {
            return;
        }
        ownPagesRef.current.set(index, syncedPageRef.current);
        writeEntry(key, index, syncedPageRef.current);
    }, [key]);

    useEffect(() => {
        const index = currentIndex();
        if (!key || index === undefined || currentPage === syncedPageRef.current) {
            return;
        }
        syncedPageRef.current = currentPage;
        // Returning to the page just behind steps back, so in-page back buttons don't pile up entries
        if (ownPagesRef.current.get(index - 1) === currentPage) {
            window.history.back();
            return;
        }
        window.history.pushState(
            { ...window.history.state, idx: index + 1, key: Math.random().toString(36).substring(2, 10) },
            "",
            window.location.href
        );
        ownPagesRef.current.set(index + 1, currentPage);
        writeEntry(key, index + 1, currentPage);
    }, [key, currentPage]);

    useEffect(() => {
        if (!key) {
            return;
        }
        const onPopState = () => {
            const index = currentIndex();
            const page = index === undefined ? undefined : entryPage(key, index);
            if (page === undefined) {
                return;
            }
            syncedPageRef.current = page;
            onPageChangeRef.current?.(page);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [key]);
}
