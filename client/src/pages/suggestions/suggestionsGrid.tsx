import { useEffect, useState } from "react";
import { useGetSuggestionsQuery } from "../../api";
import CardGrid, { CardGridQueryState } from "../../components/cardGrid";
import SortSelect from "../../components/sortSelect";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../hooks/useAuth";
import useDebounce from "../../hooks/useDebounce";
import SuggestionCardLink from "./suggestionCardLink";
import {
    isSuggestionFilterActive,
    SuggestionFilterSearchBar,
    SuggestionFilterValue
} from "../../components/data/suggestionFilter";
import { SortOption, sortOptions } from "./suggestionSortOptions";
import useSuggestionServerFilter, { suggestionListQueryExtras, suggestionSortOrderBy } from "./suggestionServerFilter";
import { useDistinctTraits, useDistinctUsers } from "./useFilteredSuggestionList";
import { ICardSuggestionFilterable } from "common/models/cards";
import type { IGetRequest } from "server/types";

const PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 500;

const EMPTY_GRID_STATE: CardGridQueryState<ICardSuggestionFilterable> = {
    items: [],
    isInitialLoading: true,
    isRefreshing: false,
    isFetching: false
};

// A fully controlled component - filter/search/sort/unseen live in the dashboard's own state (see
// index.tsx), so a stat card can jump straight into a preset view via a plain state update.
const SuggestionsGrid = ({
    animationKey,
    filter,
    onFilterChange,
    search,
    onSearchChange,
    sortBy,
    onSortChange,
    onBack
}: SuggestionsGridProps) => {
    const { user } = useAuth();
    const isFilterActive = isSuggestionFilterActive(filter);

    // Keystrokes live here, not in index.tsx's state, so typing doesn't re-render the whole dashboard.
    const [rawSearch, setRawSearch] = useState(search);
    // Re-seeds from the parent only on a fresh browse session (openAll bumps animationKey), adjusted
    // during render per React's own reset-on-key-change pattern rather than clobbering mid-type via an effect.
    const [prevAnimationKey, setPrevAnimationKey] = useState(animationKey);
    if (animationKey !== prevAnimationKey) {
        setPrevAnimationKey(animationKey);
        setRawSearch(search);
    }

    // Search and advanced filtering are mutually exclusive - once a filter is active, leftover
    // search text stays visible in the (now tucked-away) search box but no longer applies
    const { value: debouncedSearch, isPending: isSearchDebouncing } = useDebounce(rawSearch.trim(), SEARCH_DEBOUNCE_MS);
    const effectiveSearch = isFilterActive ? "" : debouncedSearch;

    // Reports the settled value up to index.tsx (for the URL) once typing pauses - onSearchChange is
    // `setSearch` from useState, which React guarantees is referentially stable, so this can't loop.
    useEffect(() => {
        onSearchChange(debouncedSearch);
    }, [debouncedSearch, onSearchChange]);

    const serverFilter = useSuggestionServerFilter(filter, effectiveSearch, { currentUserId: user?.discordId });
    const orderBy = suggestionSortOrderBy[sortBy];
    const queryExtras = suggestionListQueryExtras(filter);

    // CardGrid's `query` prop is typed generically against IGetRequest<T> alone - suggestions' own
    // unseen/myReactions extras (ISuggestionsListQuery) are closed over here instead. Named with a `use`
    // prefix (not wrapped in useCallback, which would make eslint-plugin-react-hooks treat the hook call
    // inside it as happening in a plain callback) so it reads as the small custom hook it actually is -
    // CardGrid calls it directly during its own render, which is exactly how any custom hook composes.
    function useSuggestionsQuery(arg: IGetRequest<ICardSuggestionFilterable>) {
        return useGetSuggestionsQuery({ ...arg, ...queryExtras });
    }

    // Mirrored out of CardGrid (which now owns fetching/paging) - needed here for the filter dropdown's
    // option lists and the search box's own loading spinner.
    const [gridState, setGridState] = useState(EMPTY_GRID_STATE);
    const distinctTraits = useDistinctTraits(gridState.items);
    const distinctUsers = useDistinctUsers(gridState.items);
    const isBusy = gridState.isInitialLoading || gridState.isRefreshing;
    const isSearching = isSearchDebouncing || (isBusy && gridState.isFetching && !!effectiveSearch);

    return (
        <div className="w-full flex flex-col gap-2">
            <div className="pt-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="self-start text-sm sm:text-base tracking-widest text-secondary font-cinzel shrink-0 whitespace-nowrap cursor-pointer hover:brightness-150"
                >
                    <FontAwesomeIcon icon={faAngleLeft} /> Overview
                </button>
                <div className="hidden sm:block flex-1" />
                <SuggestionFilterSearchBar
                    search={rawSearch}
                    onSearchChange={setRawSearch}
                    filter={filter}
                    onFilterChange={onFilterChange}
                    traits={distinctTraits}
                    users={distinctUsers}
                    isDisabled={isBusy}
                    isSearching={isSearching}
                    className="w-full sm:w-auto sm:min-w-40"
                />
                <SortSelect
                    options={sortOptions}
                    value={sortBy}
                    isDisabled={isBusy}
                    onChange={onSortChange}
                    className="w-full sm:w-44"
                />
            </div>
            <CardGrid<ICardSuggestionFilterable>
                key={animationKey}
                query={useSuggestionsQuery}
                queryArgs={{ filter: serverFilter, orderBy }}
                resetKey={queryExtras}
                perPage={PER_PAGE}
                animate
                keyExtractor={(suggestion) => suggestion.id ?? ""}
                onStateChange={setGridState}
                emptyContent={
                    effectiveSearch ? (
                        <>No suggestions match &ldquo;{effectiveSearch}&rdquo;.</>
                    ) : (
                        "No suggestions match the current filters."
                    )
                }
                errorContent="Something went wrong loading suggestions."
                endContent={<>You&rsquo;ve seen everything that matches.</>}
            >
                {(suggestion) => <SuggestionCardLink suggestion={suggestion} showLikesBadge={sortBy === "likes"} />}
            </CardGrid>
        </div>
    );
};

type SuggestionsGridProps = {
    animationKey: number;
    filter: SuggestionFilterValue;
    onFilterChange: (filter: SuggestionFilterValue) => void;
    search: string;
    onSearchChange: (search: string) => void;
    sortBy: SortOption;
    onSortChange: (sort: SortOption) => void;
    onBack: () => void;
};

export default SuggestionsGrid;
