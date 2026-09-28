import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_NEUTRAL_WEIGHT } from "common/models/settings";
import { Button, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useGetSettingsQuery, useGetSuggestionsQuery } from "../../api";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import Reveal from "../../components/reveal";
import SpreadSunburst from "./spreadSunburst";
import { emptyGrid } from "./spreadCounts";
import { EMPTY_SELECTION, SpreadSelection } from "./spreadSelection";
import { FOCUS_AREAS } from "./focusAreas";

const CLEAR_TRANSITION = { duration: 0.15 } as const;

// How the active suggestion pool splits by faction and card type - a small marker flags any segment
// below what's expected for its type. A reading aid, not an auto-flagged "gap" - see focusAreas.ts.
export default function SuggestionSpread({ selection, onSelectionChange, onSelect }: SuggestionSpreadProps) {
    // Same query args SuggestionsGrid uses, so this shares its RTK cache entry. No `archived` filter
    // here - restrictArchivedVisibility already forces unarchived-only server-side.
    const { data: suggestionsData, isLoading } = useGetSuggestionsQuery();
    const { data: settings, isLoading: isSettingsLoading } = useGetSettingsQuery("suggestions");
    const neutralWeight = settings?.neutralWeight ?? DEFAULT_NEUTRAL_WEIGHT;

    const counts = useMemo(() => {
        const grid = emptyGrid();
        for (const suggestion of suggestionsData?.items ?? []) {
            if (suggestion.draft) {
                continue;
            }
            const { faction, type } = suggestion.card;
            if (faction && type && grid[faction]?.[type] !== undefined) {
                grid[faction][type]++;
            }
        }
        return grid;
    }, [suggestionsData?.items]);

    return (
        <div className="flex flex-col gap-2">
            <div className="relative px-4 md:px-0">
                {isLoading || isSettingsLoading ? (
                    <Skeleton className="aspect-square w-full rounded-full" />
                ) : (
                    <Reveal direction={null}>
                        <SpreadSunburst
                            counts={counts}
                            neutralWeight={neutralWeight}
                            selection={selection}
                            onSelectionChange={onSelectionChange}
                        />
                    </Reveal>
                )}
                <AnimatePresence>
                    {selection.size > 0 && (
                        <motion.div
                            className="absolute top-0 right-4 md:right-0"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={CLEAR_TRANSITION}
                        >
                            <Button
                                size="sm"
                                variant="flat"
                                startContent={<FontAwesomeIcon icon={faXmark} />}
                                onPress={() => onSelectionChange(EMPTY_SELECTION)}
                            >
                                Clear
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <div className="px-4 md:px-0 flex items-center gap-1.5 text-xs text-foreground/40">
                <span className="size-2 rounded-full bg-warning shrink-0" aria-hidden="true" />
                Below the expected count for that type
            </div>

            {FOCUS_AREAS.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {FOCUS_AREAS.map((area) => (
                        <button
                            key={area.label}
                            type="button"
                            onClick={() => onSelect(area.filter)}
                            className="text-xs px-2 py-1 rounded-full bg-content2 hover:bg-content3 cursor-pointer transition-colors"
                        >
                            {area.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

type SuggestionSpreadProps = {
    selection: SpreadSelection;
    onSelectionChange: (selection: SpreadSelection) => void;
    // Only the focus-area shortcuts navigate - the chart itself just picks segments
    onSelect: (filter: Partial<SuggestionFilterValue>) => void;
};
