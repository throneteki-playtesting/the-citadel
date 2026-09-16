import { useDeferredValue, useMemo } from "react";
import { useGetSuggestionsQuery } from "../../api";
import CardGrid from "../../components/cardGrid";
import SortSelect from "../../components/sortSelect";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../hooks/useAuth";
import SuggestionCardLink from "./suggestionCardLink";
import {
    isSuggestionFilterActive,
    SuggestionFilterSearchBar,
    SuggestionFilterValue
} from "../../components/data/suggestionFilter";
import { reorderTransition } from "../../constants";
import { SortOption, sortOptions } from "./suggestionSortOptions";
import useFilteredSuggestionList, { useDistinctTraits, useDistinctUsers } from "./useFilteredSuggestionList";

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
    // Unpaginated, entirely client-side filtering (same precedent ProjectContent relies on). Archived
    // and draft suggestions are already excluded server-side.
    const { data: suggestionsData, isLoading } = useGetSuggestionsQuery();
    const suggestions = useMemo(() => suggestionsData?.items ?? [], [suggestionsData?.items]);

    const deferredSearch = useDeferredValue(search.trim());
    const isFilterActive = isSuggestionFilterActive(filter);
    // Search and advanced filtering are mutually exclusive - once a filter is active, leftover
    // search text stays visible in the (now tucked-away) search box but no longer applies
    const effectiveSearch = isFilterActive ? "" : deferredSearch;

    const distinctTraits = useDistinctTraits(suggestions);
    const distinctUsers = useDistinctUsers(suggestions);

    const filtered = useFilteredSuggestionList(suggestions, {
        filter,
        search: effectiveSearch,
        sortBy,
        currentUserId: user?.discordId
    });

    const isEmpty = !isLoading && filtered.length === 0;

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
                    search={search}
                    onSearchChange={onSearchChange}
                    filter={filter}
                    onFilterChange={onFilterChange}
                    traits={distinctTraits}
                    users={distinctUsers}
                    isDisabled={isLoading}
                    className="w-full sm:w-auto sm:min-w-40"
                />
                <SortSelect
                    options={sortOptions}
                    value={sortBy}
                    isDisabled={isLoading}
                    onChange={onSortChange}
                    className="w-full !max-w-none sm:w-auto sm:!max-w-44"
                />
            </div>
            {isLoading ? (
                <CardGrid cards={[]} isLoading>
                    {() => null}
                </CardGrid>
            ) : isEmpty ? (
                <div className="p-8 text-center text-default-400">
                    {effectiveSearch ? (
                        <>No suggestions match &ldquo;{effectiveSearch}&rdquo;.</>
                    ) : (
                        "No suggestions match the current filters."
                    )}
                </div>
            ) : (
                <div
                    key={animationKey}
                    className={classNames("grid gap-1", "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5")}
                >
                    <AnimatePresence initial={false} mode="popLayout">
                        {filtered.map((suggestion) => (
                            <motion.div
                                key={suggestion.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={reorderTransition}
                            >
                                <SuggestionCardLink suggestion={suggestion} showLikesBadge={sortBy === "likes"} />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
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
