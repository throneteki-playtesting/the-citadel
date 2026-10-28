import { useCallback, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@heroui/react";
import { ICardSuggestion, ReactionType, SuggestionBulkAction } from "common/models/cards";
import SuggestionBrowser from "./suggestionBrowser";
import SuggestionCardLink from "./suggestionCardLink";
import SuggestionBulkBar from "./suggestionBulkBar";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import { SortOption } from "./suggestionSortOptions";
import { hapticTap } from "../../utils";

// The dashboard's "All Suggestions" view, with its filter/search/sort state held by the dashboard (see index.tsx).
// Picking several is entered by Multi-select or a long press; the selection is held by id, read against the loaded copies.
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
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [items, setItems] = useState<ICardSuggestion[]>([]);
    const [known, setKnown] = useState(new Map<string, ICardSuggestion>());

    // Anything which changes what's listed starts the selection over - picks out of sight are too easy to forget
    const listKey = JSON.stringify({ filter, search, sortBy, animationKey });
    const [prevListKey, setPrevListKey] = useState(listKey);
    if (listKey !== prevListKey) {
        setPrevListKey(listKey);
        setSelectedIds([]);
    }

    const onItemsChange = useCallback((next: ICardSuggestion[]) => {
        setItems(next);
        setKnown((current) => {
            const updated = new Map(current);
            for (const suggestion of next) {
                updated.set(suggestion.id!, suggestion);
            }
            return updated;
        });
    }, []);

    const selected = selectedIds.flatMap((id) => known.get(id) ?? []);
    const exit = () => {
        setIsSelecting(false);
        setSelectedIds([]);
    };
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    // Stable, so a card which is not the one picked has nothing new to render. Unpicking the last one leaves picking on -
    // only Done (or the bar's close) ends it
    const toggle = useCallback((id: string) => {
        setSelectedIds((current) =>
            current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
        );
    }, []);
    const startWith = useCallback((id: string) => {
        hapticTap();
        setIsSelecting(true);
        setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));
    }, []);
    const allShownSelected = items.length > 0 && items.every((suggestion) => selectedSet.has(suggestion.id!));
    const toggleAllShown = () =>
        setSelectedIds((current) => {
            const shown = items.map((suggestion) => suggestion.id!);
            return allShownSelected
                ? current.filter((id) => !shown.includes(id))
                : [...current, ...shown.filter((id) => !current.includes(id))];
        });
    // Deleted and ignored suggestions are gone from the list, so they leave the selection with it
    const onDone = (option: { action: SuggestionBulkAction; reactType?: ReactionType }, ids: string[]) => {
        if (option.action === "delete" || (option.action === "react" && option.reactType === "ignore")) {
            setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
        }
    };

    return (
        <div className="w-full pt-3">
            <SuggestionBulkBar
                isSelecting={isSelecting}
                selected={selected}
                shownCount={items.length}
                allShownSelected={allShownSelected}
                onToggleAllShown={toggleAllShown}
                onClear={() => setSelectedIds([])}
                onExit={exit}
                onDone={onDone}
            />
            <SuggestionBrowser
                resetKey={animationKey}
                filter={filter}
                onFilterChange={onFilterChange}
                search={search}
                onSearchChange={onSearchChange}
                sortBy={sortBy}
                onSortChange={onSortChange}
                onItemsChange={onItemsChange}
                animate
                leading={
                    <div className="flex items-center gap-2 sm:flex-1">
                        <button
                            type="button"
                            onClick={onBack}
                            className="text-left text-sm sm:text-base tracking-widest text-secondary font-cinzel shrink-0 whitespace-nowrap cursor-pointer hover:brightness-150"
                        >
                            <FontAwesomeIcon icon={faAngleLeft} /> Overview
                        </button>
                    </div>
                }
                trailing={
                    <Button
                        size="sm"
                        variant={isSelecting ? "solid" : "flat"}
                        color={isSelecting ? "primary" : "default"}
                        className="shrink-0"
                        aria-pressed={isSelecting}
                        onPress={() => (isSelecting ? exit() : setIsSelecting(true))}
                    >
                        {isSelecting ? "Done" : "Multi-select"}
                    </Button>
                }
            >
                {(suggestion) => (
                    <SuggestionCardLink
                        suggestion={suggestion}
                        showLikesBadge={sortBy === "likes"}
                        isSelecting={isSelecting}
                        isSelected={selectedSet.has(suggestion.id!)}
                        onToggle={toggle}
                        onLongPress={startWith}
                    />
                )}
            </SuggestionBrowser>
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
