import { ReactNode, useMemo, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { Skeleton, Tab, Tabs } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { countReactionsByType, ICardSuggestion, suggestionApprovalBlockReason } from "common/models/cards";
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import { UserRow } from "../../components/userAvatar";
import AnimatedNumber from "../../components/animatedNumber";
import { DAY_MS, EASE_STANDARD } from "../../constants";
import { matchesSelection, selectionSegments, SpreadSelection } from "./spreadSelection";
import SuggestionTrend from "./suggestionTrend";
import SuggestionFlow from "./suggestionFlow";
import { TREND_RANGES, TrendRange, trendBuckets } from "./trendRange";

// Shown before "View more"
const TOP_CONTRIBUTORS = 3;
const ROW_TRANSITION = { duration: 0.35, ease: EASE_STANDARD } as const;
const PHRASE_FADE = { duration: 0.2 } as const;
// What the reserved room beside the total is measured against
const LONGEST_RANGE_PHRASE = TREND_RANGES.reduce(
    (longest, option) => ((option.phrase?.length ?? 0) > longest.length ? option.phrase! : longest),
    ""
);
const BAR_TRANSITION = "transition-[width] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]";

export type Breakdown = "flow" | "contributors";

type Contributor = { discordId: string; submitted: number; approved: number };

function median(values: number[]) {
    if (values.length === 0) {
        return undefined;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function useSuggestionStats(suggestions: ICardSuggestion[], selection: SpreadSelection, range: TrendRange) {
    return useMemo(() => {
        const createdTimes: number[] = [];
        const waits: number[] = [];
        const byUser = new Map<string, { submitted: number; approved: number }>();
        let submitted = 0;
        let reached = 0;
        let approved = 0;
        let approvedAfterReaching = 0;

        for (const suggestion of suggestions) {
            if (suggestion.draft || !matchesSelection(selection, suggestion.card)) {
                continue;
            }
            submitted++;
            const created = new Date(suggestion.created).getTime();
            createdTimes.push(created);

            const engagement = suggestion._metadata?.engagement;
            const isApproved = !!engagement?.approvedBy;
            // Only likes count - approval can come before the threshold, which only earns a suggestion
            // priority, so an approved suggestion hasn't necessarily reached it
            const hasReached =
                !suggestionApprovalBlockReason(suggestion) &&
                countReactionsByType(engagement?.reactions, "like") >= SUGGESTION_APPROVAL_VOTE_THRESHOLD;
            if (hasReached) {
                reached++;
            }
            if (isApproved) {
                approved++;
                approvedAfterReaching += hasReached ? 1 : 0;
                if (engagement?.approvedAt) {
                    waits.push(Math.round((new Date(engagement.approvedAt).getTime() - created) / DAY_MS));
                }
            }

            const user = byUser.get(suggestion.createdBy) ?? { submitted: 0, approved: 0 };
            user.submitted++;
            user.approved += isApproved ? 1 : 0;
            byUser.set(suggestion.createdBy, user);
        }

        const contributors = [...byUser.entries()]
            .map(([discordId, counts]) => ({ discordId, ...counts }))
            .sort((a, b) => b.submitted - a.submitted || b.approved - a.approved);

        return {
            submitted,
            reached,
            approved,
            approvedAfterReaching,
            trend: trendBuckets(range, createdTimes, Date.now()),
            medianWait: median(waits),
            contributors
        };
    }, [suggestions, selection, range]);
}

/** Submissions, approvals and contributors for whatever's picked on the Suggestion Spread (or everything,
 *  when nothing is). Anything which can be listed opens the matching suggestions, carrying the selection. */
export default function SuggestionStats({
    suggestions,
    isLoading,
    selection,
    breakdown,
    onBreakdownChange,
    range,
    onRangeChange,
    onOpen
}: SuggestionStatsProps) {
    const stats = useSuggestionStats(suggestions, selection, range);

    if (isLoading) {
        return <SuggestionStatsSkeleton />;
    }

    const segments = selectionSegments(selection);
    const open = (filter: SuggestionFilterValue = {}) => onOpen(segments.length > 0 ? { ...filter, segments } : filter);
    const approvedShare = stats.submitted ? Math.round((stats.approved / stats.submitted) * 100) : 0;
    const rangePhrase = TREND_RANGES.find((option) => option.key === range)?.phrase;

    return (
        <div className="flex flex-col gap-4 px-4 md:px-0">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div>
                    <AnimatedNumber
                        value={stats.submitted}
                        from={0}
                        className="block text-5xl font-semibold leading-none tabular-nums"
                    />
                    <div className="mt-1.5 flex h-5 items-baseline text-xs leading-5 uppercase tracking-widest text-foreground/50">
                        Submitted
                        <span className="relative ml-2 normal-case tracking-normal text-sm leading-5 font-semibold text-success">
                            <span className="invisible" aria-hidden="true">
                                +{stats.submitted} {LONGEST_RANGE_PHRASE}
                            </span>
                            <AnimatePresence mode="wait" initial={false}>
                                {rangePhrase && stats.trend.since !== undefined && (
                                    <motion.span
                                        key={rangePhrase}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={PHRASE_FADE}
                                        className="absolute left-0 top-0 whitespace-nowrap"
                                    >
                                        +<AnimatedNumber value={stats.trend.since} /> {rangePhrase}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => open()}
                    className="flex items-center gap-1.5 text-sm text-primary cursor-pointer hover:brightness-125"
                >
                    {selection.size > 0 ? "View these suggestions" : "View all suggestions"}
                    <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                </button>
            </div>

            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-widest text-foreground/50">New suggestions</span>
                    <Tabs
                        size="sm"
                        variant="light"
                        aria-label="Chart range"
                        selectedKey={range}
                        onSelectionChange={(key) => onRangeChange(key as TrendRange)}
                    >
                        {TREND_RANGES.map((option) => (
                            <Tab key={option.key} title={option.label} />
                        ))}
                    </Tabs>
                </div>
                <SuggestionTrend counts={stats.trend.counts} starts={stats.trend.starts} unit={stats.trend.unit} />
            </div>

            <div className="grid grid-cols-3 border-y border-content3 divide-x divide-content3">
                <Figure label="Approved" accent onPress={() => open({ approvedFilter: "only" })}>
                    <AnimatedNumber value={stats.approved} />
                    <small className="text-xs font-medium text-foreground/50">{approvedShare}%</small>
                </Figure>
                <Figure label="Awaiting a decision" onPress={() => open({ approvedFilter: "awaiting" })}>
                    <AnimatedNumber value={stats.reached - stats.approvedAfterReaching} />
                </Figure>
                <Figure label="Median wait from submission to approval">
                    {stats.medianWait === undefined ? (
                        "–"
                    ) : (
                        <>
                            <AnimatedNumber value={stats.medianWait} />
                            <small className="text-xs font-medium text-foreground/50">days</small>
                        </>
                    )}
                </Figure>
            </div>

            <div className="flex flex-col gap-2">
                <Tabs
                    size="sm"
                    variant="underlined"
                    color="primary"
                    aria-label="Suggestion breakdown"
                    selectedKey={breakdown}
                    onSelectionChange={(key) => onBreakdownChange(key as Breakdown)}
                >
                    <Tab key="contributors" title="Top contributors" />
                    <Tab key="flow" title="How far they get" />
                </Tabs>
                {breakdown === "contributors" ? (
                    <Contributors
                        contributors={stats.contributors}
                        onOpen={(discordId) => open({ byUsers: [discordId] })}
                    />
                ) : stats.submitted > 0 ? (
                    <SuggestionFlow
                        submitted={stats.submitted}
                        reached={stats.reached}
                        approvedAfterReaching={stats.approvedAfterReaching}
                        approvedDirectly={stats.approved - stats.approvedAfterReaching}
                    />
                ) : (
                    <EmptyBreakdown />
                )}
            </div>
        </div>
    );
}

function Figure({
    label,
    accent = false,
    onPress,
    children
}: {
    label: string;
    accent?: boolean;
    onPress?: () => void;
    children: ReactNode;
}) {
    const content = (
        <>
            <div
                className={classNames(
                    "flex items-baseline gap-1 text-xl sm:text-2xl font-semibold tabular-nums",
                    accent && "text-primary"
                )}
            >
                {children}
            </div>
            <div className="flex items-center gap-1 text-xs text-foreground/50 leading-snug">
                {label}
                {onPress && (
                    <FontAwesomeIcon
                        icon={faArrowRight}
                        className="text-[0.6rem] opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0"
                    />
                )}
            </div>
        </>
    );
    const className = "flex flex-col gap-0.5 px-2 py-3 sm:px-3.5 text-left";
    return onPress ? (
        <button
            type="button"
            onClick={onPress}
            className={classNames(className, "group cursor-pointer transition-colors hover:bg-content2")}
        >
            {content}
        </button>
    ) : (
        <div className={className}>{content}</div>
    );
}

function Contributors({ contributors, onOpen }: { contributors: Contributor[]; onOpen: (discordId: string) => void }) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (contributors.length === 0) {
        return <EmptyBreakdown />;
    }
    const most = contributors[0].submitted;
    // Only what's on show is mounted - each row looks its user up, so the rest wait until asked for
    const shown = isExpanded ? contributors : contributors.slice(0, TOP_CONTRIBUTORS);
    const hidden = contributors.length - TOP_CONTRIBUTORS;

    return (
        <div className="flex flex-col">
            <div className="relative flex flex-col">
                <AnimatePresence initial={false} mode="popLayout">
                    {shown.map((contributor) => (
                        <motion.div
                            key={contributor.discordId}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={ROW_TRANSITION}
                            className="w-full"
                        >
                            <ContributorRow contributor={contributor} most={most} onOpen={onOpen} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            <motion.div layout="position" transition={ROW_TRANSITION} className="flex flex-col">
                {hidden > 0 && (
                    <button
                        type="button"
                        onClick={() => setIsExpanded((previous) => !previous)}
                        className="self-start flex items-center gap-1.5 px-2 py-1 text-xs text-primary cursor-pointer hover:brightness-125"
                    >
                        {isExpanded ? "View less" : `View ${hidden} more`}
                        <FontAwesomeIcon
                            icon={faChevronDown}
                            className={classNames("text-[0.6rem] transition-transform", isExpanded && "rotate-180")}
                        />
                    </button>
                )}
                <div className="flex gap-4 px-2 pt-1 text-xs text-foreground/40">
                    <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" />
                        Approved
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-2.5 rounded-sm bg-content4" aria-hidden="true" />
                        Not yet approved
                    </span>
                </div>
            </motion.div>
        </div>
    );
}

function ContributorRow({
    contributor,
    most,
    onOpen
}: {
    contributor: Contributor;
    most: number;
    onOpen: (discordId: string) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onOpen(contributor.discordId)}
            className="w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 text-left cursor-pointer transition-colors hover:bg-content2"
        >
            <UserRow discordId={contributor.discordId} />
            <div className="flex h-1.5 overflow-hidden rounded-full bg-content2">
                <div
                    className={classNames("bg-primary", BAR_TRANSITION)}
                    style={{ width: `${(contributor.approved / most) * 100}%` }}
                />
                <div
                    className={classNames("bg-content4", BAR_TRANSITION)}
                    style={{ width: `${((contributor.submitted - contributor.approved) / most) * 100}%` }}
                />
            </div>
            <span className="text-xs text-foreground/50 whitespace-nowrap tabular-nums">
                <AnimatedNumber value={contributor.submitted} className="font-semibold text-foreground" /> ·{" "}
                <AnimatedNumber value={contributor.approved} /> approved
            </span>
        </button>
    );
}

function EmptyBreakdown() {
    return <div className="py-6 text-center text-sm text-foreground/40">No suggestions here yet.</div>;
}

function SuggestionStatsSkeleton() {
    return (
        <div className="flex flex-col gap-4 px-4 md:px-0">
            <div className="flex items-end justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-12 w-28 rounded-md" />
                    <Skeleton className="h-4 w-40 rounded-md" />
                </div>
                <Skeleton className="h-5 w-40 rounded-md" />
            </div>
            <Skeleton className="aspect-[46/13] w-full rounded-md" />
            <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 rounded-md" />
                ))}
            </div>
            <Skeleton className="h-8 w-56 rounded-md" />
            <Skeleton className="aspect-[460/196] w-full rounded-md" />
        </div>
    );
}

type SuggestionStatsProps = {
    suggestions: ICardSuggestion[];
    isLoading: boolean;
    selection: SpreadSelection;
    breakdown: Breakdown;
    onBreakdownChange: (breakdown: Breakdown) => void;
    range: TrendRange;
    onRangeChange: (range: TrendRange) => void;
    onOpen: (filter: SuggestionFilterValue) => void;
};
