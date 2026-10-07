import { ReactNode, useEffect, useState } from "react";
import AnimatedHeight from "../../components/animatedHeight";
import { ICardSuggestion, ICardSuggestionFilterable, ISuggestionsListQuery } from "common/models/cards";
import type { IGetRequest } from "server/types";
import { useGetSuggestionFilterOptionsQuery, useGetSuggestionsQuery } from "../../api";
import CardGrid, { CardGridQueryState } from "../../components/cardGrid";
import SortSelect from "../../components/sortSelect";
import { useAuth } from "../../hooks/useAuth";
import useDebounce from "../../hooks/useDebounce";
import {
    isPlotsOnly,
    isSuggestionFilterActive,
    SuggestionFilterSearchBar,
    SuggestionFilterValue
} from "../../components/data/suggestionFilter";
import { SortOption, sortOptions } from "./suggestionSortOptions";
import useSuggestionServerFilter, { suggestionListQueryExtras, suggestionSortOrderBy } from "./suggestionServerFilter";

const PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 500;

const EMPTY_GRID_STATE: CardGridQueryState<ICardSuggestionFilterable> = {
    items: [],
    isInitialLoading: true,
    isRefreshing: false,
    isFetching: false
};

// Search, filter, sort and a paged grid of suggestions - fully controlled, so whoever shows it decides where that
// state lives. The dashboard keeps it in the url; a picker keeps it for as long as it is open.
export default function SuggestionBrowser({
    resetKey,
    filter,
    onFilterChange,
    search,
    onSearchChange,
    sortBy,
    onSortChange,
    scope,
    queryExtras,
    isFactionFixed,
    leading,
    emptyContent,
    animate,
    scrollClassName,
    children
}: SuggestionBrowserProps) {
    const { user } = useAuth();
    const isFilterActive = isSuggestionFilterActive(filter);

    // Keystrokes live here, not with the caller, so typing doesn't re-render whatever the browser sits in
    const [rawSearch, setRawSearch] = useState(search);
    // Re-seeds from the caller only on a fresh session (resetKey), adjusted during render per React's own
    // reset-on-key-change pattern rather than clobbering mid-type via an effect
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (resetKey !== prevResetKey) {
        setPrevResetKey(resetKey);
        setRawSearch(search);
    }

    // Search and advanced filtering are mutually exclusive - once a filter is active, leftover
    // search text stays visible in the (now tucked-away) search box but no longer applies
    const { value: debouncedSearch, isPending: isSearchDebouncing } = useDebounce(rawSearch.trim(), SEARCH_DEBOUNCE_MS);
    const effectiveSearch = isFilterActive ? "" : debouncedSearch;

    // Reports the settled value once typing pauses - callers pass a useState setter, which is stable
    useEffect(() => {
        onSearchChange(debouncedSearch);
    }, [debouncedSearch, onSearchChange]);

    const serverFilter = useSuggestionServerFilter({ ...filter, ...scope }, effectiveSearch, {
        currentUserId: user?.discordId
    });
    const orderBy = suggestionSortOrderBy[sortBy];
    const extras = { ...suggestionListQueryExtras(filter), ...queryExtras };

    // CardGrid's `query` prop only takes IGetRequest<T> - the list's own extras are closed over here.
    // Named with a `use` prefix (not useCallback) so it reads as the hook it is.
    function useSuggestionsQuery(arg: IGetRequest<ICardSuggestionFilterable>) {
        return useGetSuggestionsQuery({ ...arg, ...extras });
    }

    // Mirrored out of CardGrid (which owns fetching/paging) - needed here for the search box's spinner.
    // The filter drawer's own option lists come from a separate, full-universe query below.
    const [gridState, setGridState] = useState(EMPTY_GRID_STATE);
    const { data: filterOptions } = useGetSuggestionFilterOptionsQuery();
    const isBusy = gridState.isInitialLoading || gridState.isRefreshing;
    const isSearching = isSearchDebouncing || (isBusy && gridState.isFetching && !!effectiveSearch);

    const grid = (
        <CardGrid<ICardSuggestionFilterable>
            key={resetKey}
            query={useSuggestionsQuery}
            size={isPlotsOnly({ ...filter, ...scope }) ? "lg" : "md"}
            queryArgs={{ filter: serverFilter, orderBy }}
            resetKey={extras}
            perPage={PER_PAGE}
            animate={animate}
            keyExtractor={(suggestion) => suggestion.id ?? ""}
            onStateChange={setGridState}
            emptyContent={
                effectiveSearch ? <>No suggestions match “{effectiveSearch}”.</> : (emptyContent ?? NO_MATCHES)
            }
            errorContent="Something went wrong loading suggestions."
            endContent="You’ve seen everything that matches."
        >
            {children}
        </CardGrid>
    );

    return (
        <div className="flex w-full min-h-0 flex-col gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {leading}
                <div className="flex flex-wrap justify-end items-center gap-2 sm:ml-auto">
                    <SuggestionFilterSearchBar
                        search={rawSearch}
                        onSearchChange={setRawSearch}
                        filter={filter}
                        onFilterChange={onFilterChange}
                        traits={filterOptions?.traits ?? []}
                        users={filterOptions?.submitters ?? []}
                        isFactionFixed={isFactionFixed}
                        isDisabled={isBusy}
                        isSearching={isSearching}
                        className="min-w-40"
                    />
                    <SortSelect
                        options={sortOptions}
                        value={sortBy}
                        isDisabled={isBusy}
                        onChange={onSortChange}
                        className="w-44 shrink-0"
                    />
                </div>
            </div>
            {scrollClassName ? <AnimatedHeight className={scrollClassName}>{grid}</AnimatedHeight> : grid}
        </div>
    );
}

const NO_MATCHES = "No suggestions match the current filters.";

type SuggestionBrowserProps = {
    /** Changes when a fresh browse begins, re-seeding the search box and restarting the grid */
    resetKey: number | string;
    filter: SuggestionFilterValue;
    onFilterChange: (filter: SuggestionFilterValue) => void;
    search: string;
    onSearchChange: (search: string) => void;
    sortBy: SortOption;
    onSortChange: (sort: SortOption) => void;
    /** Narrowing the viewer can't lift, laid over their own filter - eg. a slot's faction */
    scope?: SuggestionFilterValue;
    /** List parameters beyond the filter - eg. the slot suggestions should fit */
    queryExtras?: ISuggestionsListQuery;
    /** Takes the faction choice out of the filter drawer, for a scope which already settles it */
    isFactionFixed?: boolean;
    /** Sits at the head of the controls row */
    leading?: ReactNode;
    emptyContent?: ReactNode;
    animate?: boolean;
    /** Puts the grid in a region of its own which scrolls past this max-height, leaving the controls above it in view */
    scrollClassName?: string;
    children: (suggestion: ICardSuggestion) => ReactNode;
};
