import { Fragment, useMemo, useState } from "react";
import { factions, Type, types } from "common/models/cards";
import { factionNames, typeNames } from "common/utils";
import { Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useGetSuggestionsQuery } from "../../api";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import SectionTitle from "../../components/sectionTitle";
import ThronesIcon from "../../components/thronesIcon";
import Watermark from "../../components/watermark";
import { watermarkClasses } from "../../constants";
import { FOCUS_AREAS } from "./focusAreas";

// Agendas are always neutral - every other faction's cell is left blank, and the type is excluded
// from the average calculation entirely (a single-faction column has nothing to be "below").
const BREAKDOWN_TYPES = types.filter((type) => type !== "agenda");

// How the active suggestion pool splits by faction and card type - a small marker flags any count
// below that type's own average. A reading aid, not an auto-flagged "gap" - see focusAreas.ts.

// The name/counts split is a single CSS grid (`grid-cols-[auto_1fr]`) spanning every row together,
// so the type columns line up regardless of name length - `auto` sizes to the widest cell for free.
export default function SuggestionSpread({ onSelect }: SuggestionSpreadProps) {
    const [approvedOnly, setApprovedOnly] = useState(false);

    // Same query args SuggestionsGrid uses, so this shares its RTK cache entry. No `archived` filter
    // here - restrictArchivedVisibility already forces unarchived-only server-side.
    const { data: suggestionsData, isLoading } = useGetSuggestionsQuery();
    const suggestions = useMemo(
        () =>
            (suggestionsData?.items ?? []).filter(
                (s) => !s.draft && (!approvedOnly || !!s._metadata?.engagement?.approvedBy)
            ),
        [suggestionsData?.items, approvedOnly]
    );

    const totalsByCell = useMemo(() => {
        const map = new Map<string, number>();
        for (const suggestion of suggestions) {
            const key = `${suggestion.card.faction}|${suggestion.card.type}`;
            map.set(key, (map.get(key) ?? 0) + 1);
        }
        return map;
    }, [suggestions]);

    const averageByType = useMemo(() => {
        const map = new Map<Type, number>();
        for (const type of BREAKDOWN_TYPES) {
            const sum = factions.reduce((total, faction) => total + (totalsByCell.get(`${faction}|${type}`) ?? 0), 0);
            map.set(type, sum / factions.length);
        }
        return map;
    }, [totalsByCell]);

    if (isLoading) {
        return <Skeleton className="h-64 w-full rounded-md" />;
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="px-4 md:px-0 flex flex-col gap-0.5">
                {/* Matches SuggestionApprovalPanel's own title row - the toggle sits in the title's
                    own line, with SectionTitle's trailing divider filling the gap up to it. */}
                <div className="flex items-center gap-2">
                    <SectionTitle size="sm" indent="xs" className="flex-1 min-w-0">
                        Suggestion Spread
                    </SectionTitle>
                    {/* Same icon either way - active state reads from colour, not a different icon.
                        Plain clickable text like "See all" - icon-only on mobile, label from `sm` up. */}
                    <button
                        type="button"
                        onClick={() => setApprovedOnly((prev) => !prev)}
                        className={classNames(
                            "shrink-0 flex items-center gap-1 text-xs sm:text-sm cursor-pointer hover:brightness-125",
                            approvedOnly ? "text-primary" : "text-foreground/50"
                        )}
                    >
                        <FontAwesomeIcon icon={faCircleCheck} />
                        <span className="hidden sm:inline whitespace-nowrap">Approved Only</span>
                    </button>
                </div>
                <div className="text-xs text-foreground/50 italic">
                    How the active (non-draft) suggestion pool splits by faction and card type — a tinted count sits
                    below that type&rsquo;s own average across factions. Click a number to see those suggestions.
                </div>
            </div>
            <div className="bg-content1 border border-content3 drop-shadow-lg overflow-hidden">
                <div className="grid grid-cols-[auto_1fr]">
                    <div className="bg-content2 border-b border-content3" />
                    <div className="pr-4 py-2 bg-content2 border-b border-content3 flex gap-x-2">
                        {types.map((type) => (
                            <span
                                key={type}
                                title={typeNames[type]}
                                className="flex-1 basis-0 min-w-0 flex items-center justify-center text-foreground/40"
                            >
                                <ThronesIcon name={type} />
                            </span>
                        ))}
                    </div>

                    {factions.map((faction, index) => {
                        const isLast = index === factions.length - 1;
                        return (
                            <Fragment key={faction}>
                                <div
                                    className={classNames(
                                        "relative pl-4 pr-2 py-2 flex items-center overflow-hidden",
                                        !isLast && "border-b border-content3"
                                    )}
                                >
                                    <Watermark
                                        position="left"
                                        icon={
                                            <ThronesIcon
                                                name={faction}
                                                className={classNames(
                                                    "text-5xl md:text-6xl -ml-1 md:-ml-2",
                                                    watermarkClasses[faction]
                                                )}
                                            />
                                        }
                                    />
                                    {/* flex-1 carries the text-align, unambiguous about which edge
                                        text hugs, unlike relying on justify-content over one item */}
                                    <div className="relative flex-1 text-right">
                                        <span className="md:hidden inline-block w-10 h-6 align-middle" />
                                        <span className="hidden md:inline whitespace-nowrap font-cinzel text-sm tracking-wide text-foreground">
                                            {factionNames[faction]}
                                        </span>
                                    </div>
                                </div>
                                <div
                                    className={classNames(
                                        "pr-4 py-2 flex gap-x-2",
                                        !isLast && "border-b border-content3"
                                    )}
                                >
                                    {types.map((type) => {
                                        if (type === "agenda" && faction !== "neutral") {
                                            return <div key={type} className="flex-1 basis-0 min-w-0" />;
                                        }
                                        const count = totalsByCell.get(`${faction}|${type}`) ?? 0;
                                        const average = averageByType.get(type) ?? 0;
                                        const isThin = average > 0 && count < average;
                                        return (
                                            <button
                                                key={type}
                                                type="button"
                                                title={
                                                    isThin
                                                        ? `${typeNames[type]} — below the average of ${average.toFixed(1)}`
                                                        : typeNames[type]
                                                }
                                                disabled={count === 0}
                                                onClick={() =>
                                                    onSelect({
                                                        faction: [faction],
                                                        type: [type],
                                                        // "Only Approved" already implies non-draft, so
                                                        // it replaces rather than stacks with it.
                                                        draftFilter: approvedOnly ? undefined : "none",
                                                        approvedFilter: approvedOnly ? "only" : undefined
                                                    })
                                                }
                                                className={classNames(
                                                    "flex-1 basis-0 min-w-0 text-sm tabular-nums text-center",
                                                    isThin ? "text-warning" : "text-foreground",
                                                    count === 0
                                                        ? "cursor-default"
                                                        : classNames(
                                                              "cursor-pointer",
                                                              isThin ? "hover:brightness-125" : "hover:text-primary"
                                                          )
                                                )}
                                            >
                                                {count}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Fragment>
                        );
                    })}
                </div>
            </div>
            <div className="px-4 md:px-0 flex items-center gap-1.5 text-xs text-foreground/40">
                <span className="text-warning tabular-nums font-semibold">12</span>
                Below that type&rsquo;s average across all factions
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
    onSelect: (filter: Partial<SuggestionFilterValue>) => void;
};
