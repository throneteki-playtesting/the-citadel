import { useDeferredValue, useMemo } from "react";
import { ICardSuggestion } from "common/models/cards";
import { useGetSuggestionsQuery } from "../../api";
import { factionNames, typeNames } from "common/utils";
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
    SuggestionFilterValue,
    useSuggestionFilterPredicate
} from "../../components/data/suggestionFilter";
import { reorderTransition } from "../../constants";
import { SortOption, sortOptions } from "./suggestionSortOptions";

function matchesSearch(suggestion: ICardSuggestion, term: string) {
    const card = suggestion.card;
    if (card.name.toLowerCase().includes(term)) return true;
    if (card.text?.toLowerCase().includes(term)) return true;
    if (factionNames[card.faction]?.toLowerCase().includes(term)) return true;
    if (typeNames[card.type]?.toLowerCase().includes(term)) return true;
    if (card.traits?.some((trait) => trait.toLowerCase().includes(term))) return true;
    if (suggestion.user.displayname.toLowerCase().includes(term)) return true;
    return false;
}

const updatedDesc = (a: ICardSuggestion, b: ICardSuggestion) =>
    new Date(b.updated).getTime() - new Date(a.updated).getTime();

function countLikes(suggestion: ICardSuggestion) {
    return Object.values(suggestion._metadata?.engagement?.reactions ?? {}).filter((entry) => entry.type === "like")
        .length;
}

const comparators: Record<SortOption, (a: ICardSuggestion, b: ICardSuggestion) => number> = {
    name: (a, b) => a.card.name.localeCompare(b.card.name),
    faction: (a, b) => a.card.faction.localeCompare(b.card.faction) || a.card.name.localeCompare(b.card.name),
    type: (a, b) => a.card.type.localeCompare(b.card.type) || a.card.name.localeCompare(b.card.name),
    created: (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    updated: updatedDesc,
    likes: (a, b) => countLikes(b) - countLikes(a) || a.card.name.localeCompare(b.card.name),
    draft: (a, b) => Number(b.draft) - Number(a.draft) || updatedDesc(a, b)
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
    // Unpaginated, entirely client-side filtering (same precedent ProjectContent relies on). No
    // `archived` filter here - restrictArchivedVisibility already forces unarchived-only server-side.
    const { data: suggestionsData, isLoading } = useGetSuggestionsQuery();
    const suggestions = useMemo(() => suggestionsData?.items ?? [], [suggestionsData?.items]);

    const deferredSearch = useDeferredValue(search.trim());
    const isFilterActive = isSuggestionFilterActive(filter);
    // Search and advanced filtering are mutually exclusive - once a filter is active, leftover
    // search text stays visible in the (now tucked-away) search box but no longer applies
    const effectiveSearch = isFilterActive ? "" : deferredSearch;

    const matchesFilter = useSuggestionFilterPredicate(filter, { currentUserId: user?.discordId });

    const distinctTraits = useMemo(
        () => [...new Set(suggestions.flatMap((suggestion) => suggestion.card.traits))].sort(),
        [suggestions]
    );
    // One entry per distinct submitter actually present in the fetched set - same "options come from
    // what's really here" precedent distinctTraits already sets, rather than a separate user lookup.
    const distinctUsers = useMemo(() => {
        const byId = new Map<string, string>();
        for (const suggestion of suggestions) {
            byId.set(suggestion.user.discordId, suggestion.user.displayname);
        }
        return [...byId.entries()]
            .map(([discordId, displayname]) => ({ discordId, displayname }))
            .sort((a, b) => a.displayname.localeCompare(b.displayname));
    }, [suggestions]);

    const filtered = useMemo(() => {
        const term = effectiveSearch.toLowerCase();
        return suggestions
            .filter((suggestion) => (!term || matchesSearch(suggestion, term)) && matchesFilter(suggestion))
            .sort(comparators[sortBy]);
    }, [suggestions, effectiveSearch, matchesFilter, sortBy]);

    const isEmpty = !isLoading && filtered.length === 0;

    return (
        <div className="w-full flex flex-col gap-2">
            <button
                type="button"
                onClick={onBack}
                className="w-fit text-lg sm:text-2xl tracking-widest text-secondary font-cinzel leading-tight hover:brightness-150 cursor-pointer"
            >
                <FontAwesomeIcon icon={faAngleLeft} /> Suggestions
            </button>
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1" />
                <SuggestionFilterSearchBar
                    search={search}
                    onSearchChange={onSearchChange}
                    filter={filter}
                    onFilterChange={onFilterChange}
                    traits={distinctTraits}
                    users={distinctUsers}
                    isDisabled={isLoading}
                    className="min-w-40"
                />
                <SortSelect options={sortOptions} value={sortBy} isDisabled={isLoading} onChange={onSortChange} />
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
