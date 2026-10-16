import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import SuggestionBrowser from "./suggestionBrowser";
import SuggestionCardLink from "./suggestionCardLink";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import { SortOption } from "./suggestionSortOptions";

// The dashboard's "All Suggestions" view - filter/search/sort/unseen live in the dashboard's own state (see
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
}: SuggestionsGridProps) => (
    <div className="w-full pt-3">
        <SuggestionBrowser
            resetKey={animationKey}
            filter={filter}
            onFilterChange={onFilterChange}
            search={search}
            onSearchChange={onSearchChange}
            sortBy={sortBy}
            onSortChange={onSortChange}
            animate
            leading={
                <button
                    type="button"
                    onClick={onBack}
                    className="self-start sm:self-auto sm:flex-1 text-left text-sm sm:text-base tracking-widest text-secondary font-cinzel shrink-0 whitespace-nowrap cursor-pointer hover:brightness-150"
                >
                    <FontAwesomeIcon icon={faAngleLeft} /> Overview
                </button>
            }
        >
            {(suggestion) => <SuggestionCardLink suggestion={suggestion} showLikesBadge={sortBy === "likes"} />}
        </SuggestionBrowser>
    </div>
);

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
