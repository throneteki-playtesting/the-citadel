import { useCallback, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft, faListCheck } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@heroui/react";
import { ICardSuggestion, SuggestionBulkAction } from "common/models/cards";
import SuggestionBrowser from "./suggestionBrowser";
import SuggestionCardLink from "./suggestionCardLink";
import SuggestionBulkBar from "./suggestionBulkBar";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import { SortOption } from "./suggestionSortOptions";
import { TouchTooltip } from "../../components/touchTooltip";

function hapticTap() {
    try {
        navigator.vibrate?.(10);
    } catch {
        // Not every browser lets a page buzz - it's only ever a nicety
    }
}

// The dashboard's "All Suggestions" view - filter/search/sort/unseen live in the dashboard's own state (see
// index.tsx), so a stat card can jump straight into a preset view via a plain state update.
//
// It can also act on many suggestions at once. Picking is entered by the Select button, or on a touch screen by
// holding a card (which starts already picked); while picking, a tap picks rather than opens. The selection is held
// by id and read against the grid's current copies, so what the action bar counts is never a stale snapshot.
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
    // Unpicking the last one is done picking, as on the Suggestion Spread wheel - the bar has nothing left to act on
    const toggle = (id: string) => {
        const next = selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id];
        setSelectedIds(next);
        if (next.length === 0) {
            setIsSelecting(false);
        }
    };
    const startWith = (id: string) => {
        hapticTap();
        setIsSelecting(true);
        setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));
    };
    const allShownSelected = items.length > 0 && items.every((suggestion) => selectedIds.includes(suggestion.id!));
    const onDone = (action: SuggestionBulkAction, ids: string[]) => {
        if (action === "delete") {
            const remaining = selectedIds.filter((id) => !ids.includes(id));
            setSelectedIds(remaining);
            if (remaining.length === 0) {
                setIsSelecting(false);
            }
        }
    };

    return (
        <div className="w-full pt-3">
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
                        {isSelecting && items.length > 0 && (
                            <Button
                                size="sm"
                                variant="light"
                                className="ml-auto sm:ml-0"
                                onPress={() =>
                                    setSelectedIds(
                                        allShownSelected
                                            ? selectedIds.filter((id) => !items.some((item) => item.id === id))
                                            : [
                                                  ...selectedIds,
                                                  ...items
                                                      .map((suggestion) => suggestion.id!)
                                                      .filter((id) => !selectedIds.includes(id))
                                              ]
                                    )
                                }
                            >
                                {allShownSelected ? "Deselect all shown" : `Select all ${items.length} shown`}
                            </Button>
                        )}
                    </div>
                }
                trailing={
                    <TouchTooltip content={isSelecting ? "Stop selecting" : "Select several"} placement="top">
                        <Button
                            size="sm"
                            variant={isSelecting ? "solid" : "flat"}
                            color={isSelecting ? "primary" : "default"}
                            isIconOnly
                            className="shrink-0 sm:w-auto sm:px-3 sm:gap-2"
                            aria-pressed={isSelecting}
                            aria-label={isSelecting ? "Stop selecting" : "Select several"}
                            onPress={() => (isSelecting ? exit() : setIsSelecting(true))}
                        >
                            <FontAwesomeIcon icon={faListCheck} />
                            <span className="hidden sm:inline">{isSelecting ? "Done" : "Select"}</span>
                        </Button>
                    </TouchTooltip>
                }
            >
                {(suggestion) => (
                    <SuggestionCardLink
                        suggestion={suggestion}
                        showLikesBadge={sortBy === "likes"}
                        selection={{
                            isSelecting,
                            isSelected: selectedIds.includes(suggestion.id!),
                            onToggle: () => toggle(suggestion.id!),
                            onLongPress: () => startWith(suggestion.id!)
                        }}
                    />
                )}
            </SuggestionBrowser>
            <SuggestionBulkBar
                isSelecting={isSelecting}
                selected={selected}
                onClear={() => setSelectedIds([])}
                onExit={exit}
                onDone={onDone}
            />
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
