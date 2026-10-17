import { useMemo } from "react";
import { ICardSuggestion } from "common/models/cards";
import { factionNames, typeNames } from "common/utils";
import useSuggestionFilterPredicate from "../../components/data/suggestionFilter/useSuggestionFilterPredicate";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import { SortOption } from "./suggestionSortOptions";

// Shared between the "All Suggestions" grid and the "My Drafts" modal - same search/filter/sort
// mechanic either way, just applied to a different starting set.

function matchesSearch(suggestion: ICardSuggestion, term: string) {
    const card = suggestion.card;
    return (
        card.name.toLowerCase().includes(term) ||
        !!card.text?.toLowerCase().includes(term) ||
        !!factionNames[card.faction]?.toLowerCase().includes(term) ||
        !!typeNames[card.type]?.toLowerCase().includes(term) ||
        !!card.traits?.some((trait) => trait.toLowerCase().includes(term))
    );
}

const updatedDesc = (a: ICardSuggestion, b: ICardSuggestion) =>
    new Date(b.updated).getTime() - new Date(a.updated).getTime();

function countLikes(suggestion: ICardSuggestion) {
    return Object.values(suggestion._metadata?.engagement?.reactions ?? {}).filter((entry) => entry.type === "like")
        .length;
}

export const suggestionSortComparators: Record<SortOption, (a: ICardSuggestion, b: ICardSuggestion) => number> = {
    name: (a, b) => a.card.name.localeCompare(b.card.name),
    faction: (a, b) => a.card.faction.localeCompare(b.card.faction) || a.card.name.localeCompare(b.card.name),
    type: (a, b) => a.card.type.localeCompare(b.card.type) || a.card.name.localeCompare(b.card.name),
    created: (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    updated: updatedDesc,
    likes: (a, b) => countLikes(b) - countLikes(a) || a.card.name.localeCompare(b.card.name)
};

export function useDistinctTraits(suggestions: ICardSuggestion[]) {
    return useMemo(
        () => [...new Set(suggestions.flatMap((suggestion) => suggestion.card.traits))].sort(),
        [suggestions]
    );
}

export default function useFilteredSuggestionList(
    suggestions: ICardSuggestion[],
    options: {
        filter: SuggestionFilterValue;
        search: string;
        sortBy: SortOption;
        currentUserId?: string;
    }
) {
    const { filter, search, sortBy, currentUserId } = options;
    const matchesFilter = useSuggestionFilterPredicate(filter, { currentUserId });

    return useMemo(() => {
        const term = search.trim().toLowerCase();
        return suggestions
            .filter((suggestion) => (!term || matchesSearch(suggestion, term)) && matchesFilter(suggestion))
            .sort(suggestionSortComparators[sortBy]);
    }, [suggestions, search, matchesFilter, sortBy]);
}
