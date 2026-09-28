import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGetSettingsQuery, useGetSuggestionsQuery } from "../../api";
import { DEFAULT_TREND_RANGE } from "common/models/settings";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import SectionTitle from "../../components/sectionTitle";
import { useSearchParamsScope } from "../../hooks/useSearchParamsScope";
import SuggestionSpread from "./suggestionSpread";
import SuggestionStats, { Breakdown } from "./suggestionStats";
import { SpreadSelection, selectionFromSegments, selectionSegments } from "./spreadSelection";
import { decodeSegments, encodeSegments } from "./suggestionFilterUrl";
import { isTrendRange, TrendRange } from "./trendRange";

/** The Suggestion Spread and the statistics it narrows, as one section - picking on the chart focuses
 *  every figure beside it. The selection and open breakdown live in the url, so a view can be shared. */
export default function SuggestionStatistics({ isActive, onOpen }: SuggestionStatisticsProps) {
    // Seeded once from the url (`spread`, `breakdown`, `range`); from then on the scope below writes them back out.
    // `spread`, not `segments` - that name already belongs to the browse page's own filter.
    const [searchParams] = useSearchParams();
    const [selection, setSelection] = useState<SpreadSelection>(() =>
        selectionFromSegments(decodeSegments(searchParams.get("spread")))
    );
    const [breakdown, setBreakdown] = useState<Breakdown>(() =>
        searchParams.get("breakdown") === "flow" ? "flow" : "contributors"
    );
    // Only a range somebody picked (or a link carried) is held here - otherwise the chart follows the Suggestion
    // Settings default, which may still be on its way
    const [pickedRange, setPickedRange] = useState<TrendRange | undefined>(() => {
        const raw = searchParams.get("range");
        return isTrendRange(raw) ? raw : undefined;
    });
    const { data: settings, isLoading: isSettingsLoading } = useGetSettingsQuery("suggestions");
    const defaultRange = isTrendRange(settings?.defaultTrendRange) ? settings.defaultTrendRange : DEFAULT_TREND_RANGE;
    const range = pickedRange ?? defaultRange;

    // Memoized, not an inline object literal - a fresh object every render re-fires the effect that
    // depends on it by reference, re-registering the scope in an infinite "update depth exceeded" loop.
    const scopeParams = useMemo(
        () => ({
            spread: encodeSegments(selectionSegments(selection)),
            breakdown: breakdown === "contributors" ? undefined : breakdown,
            range: range === defaultRange ? undefined : range
        }),
        [selection, breakdown, range, defaultRange]
    );
    useSearchParamsScope("suggestion-statistics", isActive, scopeParams);

    const { data: suggestionsData, isLoading } = useGetSuggestionsQuery();
    const suggestions = useMemo(() => suggestionsData?.items ?? [], [suggestionsData?.items]);
    // Held for the settings too, so the chart doesn't open on one range and hop to the default
    const isStatsLoading = isLoading || isSettingsLoading;

    return (
        <div className="flex flex-col gap-3">
            <div className="px-4 md:px-0 flex flex-col gap-0.5">
                <SectionTitle size="sm" indent="xs">
                    Suggestion Statistics
                </SectionTitle>
                <div className="text-xs text-foreground/50 italic">
                    Where suggestions are landing, and how far they get towards approval. Click a faction or card type
                    on the chart to focus every figure on it, or Ctrl-click to pick several.
                </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-8">
                <div className="md:flex-1 min-w-0">
                    <SuggestionSpread selection={selection} onSelectionChange={setSelection} onSelect={onOpen} />
                </div>
                <div className="md:flex-1 min-w-0">
                    <SuggestionStats
                        suggestions={suggestions}
                        isLoading={isStatsLoading}
                        selection={selection}
                        breakdown={breakdown}
                        onBreakdownChange={setBreakdown}
                        range={range}
                        onRangeChange={setPickedRange}
                        onOpen={onOpen}
                    />
                </div>
            </div>
        </div>
    );
}

type SuggestionStatisticsProps = {
    // Off while the browse page is showing, so a link shared from there doesn't carry the dashboard's view
    isActive: boolean;
    onOpen: (filter: SuggestionFilterValue) => void;
};
