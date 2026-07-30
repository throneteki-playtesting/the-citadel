import { useEffect, useMemo, useRef, useState } from "react";
import { useGetUsersQuery } from "../api";
import { User } from "common/models/auth";
import { Filter } from "common/types";
import { escapeRegExp } from "common/utils";

const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 20;

export default function usePaginatedUsers(baseFilter?: Filter<User> | Filter<User>[]) {
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<User[]>([]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const pagesRef = useRef<Map<number, User[]>>(new Map());

    useEffect(() => {
        const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(handle);
    }, [search]);

    useEffect(() => {
        pagesRef.current = new Map();
        setItems([]);
        setPage(1);
    }, [debouncedSearch]);

    const filter = useMemo((): Filter<User>[] => {
        const baseClauses = (
            Array.isArray(baseFilter) ? baseFilter : baseFilter ? [baseFilter] : [{}]
        ) as Filter<User>[];
        if (!debouncedSearch) {
            return baseClauses;
        }

        const regex = { $regex: `(?i)${escapeRegExp(debouncedSearch)}` };
        return baseClauses.flatMap((clause): Filter<User>[] => [
            { ...clause, username: regex } as Filter<User>,
            { ...clause, displayname: regex } as Filter<User>
        ]);
    }, [baseFilter, debouncedSearch]);

    const { data, isLoading, isFetching } = useGetUsersQuery({ filter, page, perPage: PER_PAGE });

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

    return { items, isLoading, isFetching, hasMore, handleLoadMore, search, setSearch };
}
