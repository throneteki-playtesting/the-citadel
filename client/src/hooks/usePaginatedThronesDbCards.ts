import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchTDBCardsQuery } from "../api/thronesdb";
import { ILabeledCard } from "common/models/cards";
import { Filter } from "common/types";
import { escapeRegExp } from "common/utils";

const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 20;

// Restricted to genuinely printed (non-work-in-progress) cards - the only ones either Comparable
// Cards or Combos With is allowed to reference.
export default function usePaginatedThronesDbCards() {
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<ILabeledCard[]>([]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const pagesRef = useRef<Map<number, ILabeledCard[]>>(new Map());

    useEffect(() => {
        const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(handle);
    }, [search]);

    useEffect(() => {
        pagesRef.current = new Map();
        setItems([]);
        setPage(1);
    }, [debouncedSearch]);

    const filter = useMemo((): Filter<ILabeledCard>[] => {
        // Plain boolean equality, not `{ $ne: true }` - the filter schema only allows `$exists` for
        // boolean fields, so `$ne` fails request validation and silently returns no results.
        const baseClause = { workInProgress: false } as Filter<ILabeledCard>;
        if (!debouncedSearch) {
            return [baseClause];
        }

        const regex = { $regex: `(?i)${escapeRegExp(debouncedSearch)}` };
        return [
            { ...baseClause, name: regex } as Filter<ILabeledCard>,
            { ...baseClause, label: regex } as Filter<ILabeledCard>
        ];
    }, [debouncedSearch]);

    const { data, isLoading, isFetching } = useSearchTDBCardsQuery({
        filter,
        orderBy: { name: "asc", code: "asc" },
        page,
        perPage: PER_PAGE
    });

    useEffect(() => {
        if (data?.items) {
            pagesRef.current.set(page, data.items);
            setItems([...pagesRef.current.entries()].sort(([a], [b]) => a - b).flatMap(([, pageItems]) => pageItems));
        }
    }, [data, page]);

    const hasMore = items.length < (data?.total ?? 0);
    const handleLoadMore = () => {
        if (hasMore && !isFetching) {
            setPage((prev) => prev + 1);
        }
    };

    // Cheap re-filter for whatever's already loaded, so a keystroke doesn't wait on the debounce
    // just to hide an obviously-non-matching row already on screen
    const matches = useMemo(
        () => (card: ILabeledCard, term: string) => {
            const lower = term.toLowerCase();
            return (
                card.label.toLowerCase().includes(lower) ||
                card.name.toLowerCase().includes(lower) ||
                (card.code?.toLowerCase().includes(lower) ?? false)
            );
        },
        []
    );

    return { items, isLoading, isFetching, hasMore, handleLoadMore, search, setSearch, matches };
}
