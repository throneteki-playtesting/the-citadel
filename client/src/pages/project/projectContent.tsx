import { CardPreview } from "@agot/card-preview";
import { factionNames, parseCardCode, releaseBoundByNumber, renderPlaytestingCard, typeNames } from "common/utils";
import { Button, Skeleton } from "@heroui/react";
import { Faction, IPlaytestCard } from "common/models/cards";
import Permission from "common/models/permissions";
import CardImage from "../../components/cardImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useGetArtistsQuery, useGetCardsQuery, useGetReviewsQuery, useGetSlotsQuery } from "../../api";
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PermissionedLink from "../../components/permissionedLink";
import { HighlightTarget } from "../../components/highlightTarget";
import classNames from "classnames";
import ThronesIcon from "../../components/thronesIcon";
import SectionTitle from "../../components/sectionTitle";
import SortSelect from "../../components/sortSelect";
import { IProject, IProjectRelease } from "common/models/projects";
import { highlightTarget, reorderTransition, watermarkClasses } from "../../constants";
import Error from "../../components/error";
import {
    faCrosshairs,
    faFeather,
    faFlagCheckered,
    faScroll,
    faTableCells,
    faTableList
} from "@fortawesome/free-solid-svg-icons";
import { TouchTooltip } from "../../components/touchTooltip";
import Watermark from "../../components/watermark";
import ProgressRing from "../../components/progressRing";
import CardProgressBreakdown from "../../components/cardProgressBreakdown";
import { cardLaneBreakdown, CardLaneBreakdown } from "common/progress/calc";
import { usePermission } from "../../hooks/usePermission";
import useHistoryState from "../../hooks/useHistoryState";
import CardGrid from "../../components/cardGrid";
import {
    CardFilterSearchBar,
    CardFilterValue,
    isCardFilterActive,
    useCardFilterPredicate
} from "../../components/data/cardFilter";
import { buildDetailRows } from "./cardDetailRows";
import { cardFilterFromParams, cardFilterToParams } from "./cardFilterUrl";

type CardView = "grid" | "detail";

// Shared by the grid and detail views - each has its own empty state once a search/filter yields nothing
function NoResultsMessage({ search }: { search: string }) {
    return (
        <div className="p-8 text-center text-default-400">
            {search ? <>No cards match &ldquo;{search}&rdquo;.</> : "No cards match the current filters."}
        </div>
    );
}

// The URL query params this page owns - cleared and rebuilt on every sync so a removed filter value
// doesn't linger in the URL, while any other param (eg. one added by another page's link) survives untouched
const URL_OWNED_KEYS = [
    "q",
    "view",
    "type",
    "faction",
    "loyal",
    "unique",
    "icons",
    "cost",
    "strength",
    "income",
    "initiative",
    "claim",
    "reserve",
    "name",
    "text",
    "flavor",
    "designer",
    "traits",
    "releaseCodes"
];

const sortOptions: Record<SortOption, string> = {
    number: "Card Number",
    name: "Card Name",
    reviews: "Fewest Reviews",
    priority: "Testing Priority",
    progress: "Progress"
};

const FADE_TRANSITION = { duration: 0.12 } as const;

// Shared by the sort-specific badges pinned to a card's bottom-right corner
const CORNER_BADGE_CLASS =
    "absolute bottom-0 right-0 m-2 z-10 transition-opacity duration-200 group-hover:opacity-50 hover:!opacity-100";

function compareByReviews(cardStats: Map<number, CardStats>, a: IPlaytestCard, b: IPlaytestCard) {
    const statA = cardStats.get(a.number) ?? { latest: 0, total: 0 };
    const statB = cardStats.get(b.number) ?? { latest: 0, total: 0 };
    return statA.latest - statB.latest || statA.total - statB.total || a.number - b.number;
}

function matchesSearch(card: IPlaytestCard, term: string) {
    if (card.name.toLowerCase().includes(term)) {
        return true;
    }
    if (card.text?.toLowerCase().includes(term)) {
        return true;
    }
    if (factionNames[card.faction]?.toLowerCase().includes(term)) {
        return true;
    }
    if (typeNames[card.type]?.toLowerCase().includes(term)) {
        return true;
    }
    if (card.traits?.some((trait) => trait.toLowerCase().includes(term))) {
        return true;
    }
    return false;
}

export default function ProjectContent({ project }: ProjectContentProps) {
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, latest: true } });
    const { data: reviewsData, isLoading: isLoadingReviews } = useGetReviewsQuery({
        filter: { project: project.number }
    });
    const { data: slotsData } = useGetSlotsQuery({ project: project.number });

    // Drafts are only ever visible to READ_CARDS holders - a READ_LATEST_CARDS-only viewer sees latest only
    const canReadDrafts = usePermission(Permission.READ_CARDS);
    const { data: draftsData } = useGetCardsQuery(
        { filter: { project: project.number, draft: true } },
        { skip: !canReadDrafts }
    );
    const draftByNumber = useMemo(
        () => new Map(draftsData?.items.map((card) => [card.number, card]) ?? []),
        [draftsData?.items]
    );
    // The newest version each viewer is entitled to see - a draft, where one exists and is visible, else latest
    const visibleCards = useMemo(
        () => (data?.items ?? []).map((card) => draftByNumber.get(card.number) ?? card),
        [data?.items, draftByNumber]
    );

    const [storedSort, setStoredSort] = useHistoryState<SortOption>("sortBy", "number");
    const [isSorting, startSorting] = useTransition();

    // Search term, advanced filter and active view are shareable via the URL - seeded once from it on
    // mount (lazy initializers), then kept in sync on change. sortBy stays on useHistoryState, untouched.
    const [searchParams, setSearchParams] = useSearchParams();
    const searchParamsRef = useRef(searchParams);
    searchParamsRef.current = searchParams;

    const [view, setView] = useState<CardView>(() => (searchParams.get("view") === "detail" ? "detail" : "grid"));
    const canReadArtists = usePermission(Permission.READ_ARTISTS);
    const { data: artistsData } = useGetArtistsQuery(undefined, { skip: !canReadArtists || view !== "detail" });

    const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
    const [cardFilter, setCardFilter] = useState<CardFilterValue>(() => cardFilterFromParams(searchParams));
    // Deferred so the input's own re-render (and the character it shows) is never blocked by
    // mounting the — potentially large — search-results grid.
    const deferredSearch = useDeferredValue(search.trim());
    const deferredCardFilter = useDeferredValue(cardFilter);
    const isFilterActive = isCardFilterActive(deferredCardFilter);

    useEffect(() => {
        const next = new URLSearchParams(searchParamsRef.current);
        for (const key of URL_OWNED_KEYS) {
            next.delete(key);
        }
        if (search.trim()) {
            next.set("q", search.trim());
        }
        if (view === "detail") {
            next.set("view", view);
        }
        for (const [key, value] of Object.entries(cardFilterToParams(cardFilter))) {
            next.set(key, value);
        }
        setSearchParams(next, { replace: true });
    }, [search, cardFilter, view, setSearchParams]);

    // Progress lives on the slots, so sorting by it is only offered to those able to read either
    const canReadSlots = usePermission(Permission.READ_SLOTS);
    const canReadProgress = usePermission(Permission.READ_STATS_SLOT) && canReadSlots;
    const availableSortOptions = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(sortOptions).filter(([key]) => key !== "progress" || canReadProgress)
            ) as Partial<Record<SortOption, string>>,
        [canReadProgress]
    );

    // An entry can outlive the permission which allowed its sort, so what it holds is only a request
    const sortBy = storedSort in availableSortOptions ? storedSort : "number";
    const setSortBy = (sort: SortOption) => startSorting(() => setStoredSort(sort));

    const cardStats = useMemo(() => {
        const cardsByNumber = new Map(data?.items.map((card) => [card.number, card]) ?? []);
        const stats = new Map<number, CardStats>();
        for (const card of cardsByNumber.values()) {
            stats.set(card.number, { latest: 0, total: 0 });
        }
        for (const review of reviewsData?.items ?? []) {
            const card = cardsByNumber.get(review.number);
            const stat = stats.get(review.number);
            if (!card || !stat) {
                continue;
            }
            stat.total += 1;
            if (review.version === card.version) {
                stat.latest += 1;
            }
        }
        return stats;
    }, [data?.items, reviewsData?.items]);

    const releasesByCode = useMemo(
        () => new Map(project.releases.map((release) => [release.code, release])),
        [project.releases]
    );

    const nextReleaseCode = useMemo(() => {
        const sorted = [...project.releases].sort((a, b) => a.number - b.number);
        return sorted.find((release) => !release.releasedDate)?.code;
    }, [project.releases]);

    const cardReleases = useMemo(() => {
        const map = new Map<number, IProjectRelease>();
        for (const slot of slotsData?.items ?? []) {
            const release = slot.release && releasesByCode.get(slot.release.code);
            if (release) {
                map.set(slot.number, release);
            }
        }
        return map;
    }, [slotsData?.items, releasesByCode]);

    const cardProgress = useMemo(() => {
        const map = new Map<number, CardLaneBreakdown>();
        if (!canReadProgress) {
            return map;
        }
        for (const slot of slotsData?.items ?? []) {
            map.set(slot.number, cardLaneBreakdown(slot.statuses));
        }
        return map;
    }, [slotsData?.items, canReadProgress]);

    const releaseCodeByCardNumber = useMemo(
        () => new Map([...cardReleases].map(([number, release]) => [number, release.code])),
        [cardReleases]
    );
    // Whether the top version is locked to its printed form - drives the "Release" vs "Draft" tile badge
    const cardIsReleaseBound = useMemo(
        () => releaseBoundByNumber(slotsData?.items ?? [], project),
        [slotsData?.items, project]
    );
    const distinctTraits = useMemo(
        () => [...new Set(visibleCards.flatMap((card) => card.traits))].sort(),
        [visibleCards]
    );
    const matchesCardFilter = useCardFilterPredicate(deferredCardFilter, { releaseCodeByCardNumber });

    const comparators = useMemo<Record<SortOption, (a: IPlaytestCard, b: IPlaytestCard) => number>>(
        () => ({
            number: (a, b) => a.number - b.number,
            name: (a, b) => a.name.localeCompare(b.name),
            reviews: (a, b) => compareByReviews(cardStats, a, b),
            priority: (a, b) => {
                const releaseA = cardReleases.get(a.number);
                const releaseB = cardReleases.get(b.number);
                if (releaseA && releaseB) {
                    return releaseA.number - releaseB.number || compareByReviews(cardStats, a, b);
                }
                if (releaseA || releaseB) {
                    return releaseA ? -1 : 1;
                }
                return compareByReviews(cardStats, a, b);
            },
            // Most complete first, so the cards closest to release lead the carousel
            progress: (a, b) => {
                const pctA = cardProgress.get(a.number)?.overall ?? 0;
                const pctB = cardProgress.get(b.number)?.overall ?? 0;
                return pctB - pctA || a.number - b.number;
            }
        }),
        [cardStats, cardReleases, cardProgress]
    );

    const cardsByFaction = useMemo(() => {
        const map = new Map<Faction, IPlaytestCard[]>();
        for (const card of visibleCards) {
            const array = map.get(card.faction) ?? [];
            array.push(card);
            map.set(card.faction, array);
        }
        for (const cards of map.values()) {
            cards.sort(comparators[sortBy]);
        }
        return map;
    }, [visibleCards, comparators, sortBy]);

    // Search and advanced filtering are mutually exclusive - once a filter is active, leftover
    // search text stays visible in the (now tucked-away) search box but no longer applies
    const effectiveSearch = isFilterActive ? "" : deferredSearch;
    const isFiltering = !!effectiveSearch || isFilterActive;
    const filteredCards = useMemo(() => {
        if (!isFiltering) {
            return [];
        }
        const term = effectiveSearch.toLowerCase();
        return visibleCards
            .filter((card) => (!term || matchesSearch(card, term)) && matchesCardFilter(card))
            .sort(comparators[sortBy]);
    }, [visibleCards, isFiltering, effectiveSearch, matchesCardFilter, comparators, sortBy]);

    // Plots are landscape — laid out at the same column count as upright cards they'd look
    // cramped, so when every result is a plot, switch to the wider preset built for them.
    const allFilteredArePlots = useMemo(
        () => filteredCards.length > 0 && filteredCards.every((card) => card.type === "plot"),
        [filteredCards]
    );

    // The detail view has no per-faction carousels of its own - one flat, sorted list either way
    const detailCards = useMemo(
        () => (isFiltering ? filteredCards : [...visibleCards].sort(comparators[sortBy])),
        [isFiltering, filteredCards, visibleCards, comparators, sortBy]
    );
    const detailRows = useMemo(
        () => buildDetailRows(detailCards, slotsData?.items ?? [], project, artistsData?.items ?? []),
        [detailCards, slotsData?.items, project, artistsData?.items]
    );

    if (!isLoading && !data) {
        return (
            <Error
                label="The Citadel's records could not be retrieved..."
                content="Something went wrong loading the cards for this project. Please try again or alert an administrator."
            />
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <SectionTitle className="sm:flex-1">Project Cards</SectionTitle>
                <div className="flex items-center gap-2 sm:contents">
                    <CardFilterSearchBar
                        search={search}
                        onSearchChange={setSearch}
                        filter={cardFilter}
                        onFilterChange={setCardFilter}
                        traits={distinctTraits}
                        releases={project.releases}
                        isDisabled={isLoading}
                    />
                    <SortSelect
                        options={availableSortOptions}
                        value={sortBy}
                        isDisabled={isLoading}
                        className="w-full sm:max-w-44"
                        onChange={setSortBy}
                    />
                    <TouchTooltip content={view === "grid" ? "Switch to Detail view" : "Switch to Gallery view"}>
                        <Button
                            isIconOnly
                            variant="flat"
                            isDisabled={isLoading}
                            aria-label={view === "grid" ? "Switch to Detail view" : "Switch to Gallery view"}
                            onPress={() => setView(view === "grid" ? "detail" : "grid")}
                        >
                            <FontAwesomeIcon icon={view === "grid" ? faTableList : faTableCells} />
                        </Button>
                    </TouchTooltip>
                </div>
            </div>
            {isLoading ? (
                <div className="flex flex-col gap-2">
                    {Object.entries(project.cardCount)
                        .filter(([, count]) => count > 0)
                        .map(([faction, count]) => (
                            <FactionCarouselSkeleton key={faction} count={count} />
                        ))}
                </div>
            ) : view === "detail" ? (
                detailRows.length === 0 ? (
                    <NoResultsMessage search={effectiveSearch} />
                ) : (
                    <div className="flex flex-col gap-1.5">{detailRows}</div>
                )
            ) : (
                <div className="grid grid-cols-1">
                    <AnimatePresence initial={false}>
                        {isFiltering ? (
                            <motion.div
                                key="search-results"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={FADE_TRANSITION}
                                className="col-start-1 row-start-1 min-w-0"
                            >
                                {filteredCards.length === 0 ? (
                                    <NoResultsMessage search={effectiveSearch} />
                                ) : (
                                    <CardGrid cards={filteredCards} size={allFilteredArePlots ? "lg" : "md"}>
                                        {(card) => (
                                            <div
                                                key={parseCardCode(false, card.project, card.number)}
                                                className={classNames(
                                                    "w-full",
                                                    card.type === "plot" ? "aspect-[333/240]" : "aspect-[240/333]"
                                                )}
                                            >
                                                <PermissionedLink
                                                    to={`/project/${card.project}/${card.number}`}
                                                    requires={Permission.READ_LATEST_CARDS}
                                                    className="group block w-full h-full scale-[0.98] transition-transform duration-200 ease-out hover:scale-100 hover:z-20 relative"
                                                >
                                                    <ProjectContentCard
                                                        card={card}
                                                        stats={isLoadingReviews ? undefined : cardStats.get(card.number)}
                                                        release={cardReleases.get(card.number)}
                                                        progress={cardProgress.get(card.number)}
                                                        isReleaseBound={cardIsReleaseBound.get(card.number) ?? false}
                                                        isNextRelease={
                                                            !!nextReleaseCode &&
                                                            cardReleases.get(card.number)?.code === nextReleaseCode
                                                        }
                                                        showReviewBadge={sortBy === "reviews"}
                                                        showProgressBadge={sortBy === "progress"}
                                                    />
                                                </PermissionedLink>
                                            </div>
                                        )}
                                    </CardGrid>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="carousels"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={FADE_TRANSITION}
                                className={classNames(
                                    "col-start-1 row-start-1 min-w-0 flex flex-col gap-2 transition-opacity",
                                    {
                                        "opacity-50 pointer-events-none": isSorting
                                    }
                                )}
                            >
                                {[...cardsByFaction.entries()].map(([faction, cards]) => (
                                    <FactionCarousel
                                        key={faction}
                                        faction={faction}
                                        cards={cards}
                                        cardStats={cardStats}
                                        cardReleases={cardReleases}
                                        cardProgress={cardProgress}
                                        cardIsReleaseBound={cardIsReleaseBound}
                                        nextReleaseCode={nextReleaseCode}
                                        sortBy={sortBy}
                                        showReviewBadge={sortBy === "reviews"}
                                        showProgressBadge={sortBy === "progress"}
                                        isLoadingReviews={isLoadingReviews || !reviewsData}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}

type ProjectContentProps = { project: IProject };
type SortOption = "number" | "name" | "reviews" | "priority" | "progress";
type CardStats = { latest: number; total: number };

function FactionCarousel({
    faction,
    cards,
    cardStats,
    cardReleases,
    cardProgress,
    cardIsReleaseBound,
    nextReleaseCode,
    sortBy,
    showReviewBadge,
    showProgressBadge,
    isLoadingReviews
}: FactionCarouselProps) {
    const percent = useMemo(() => {
        const tested = cards.filter((card) => (cardStats.get(card.number)?.total ?? 0) > 0).length;
        return Math.round((tested / cards.length) * 100);
    }, [cards, cardStats]);

    const scrollRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    }, [sortBy]);

    return (
        <HighlightTarget
            targetId={highlightTarget.factionCarousel(cards[0].project, faction)}
            className="relative border border-content3 bg-content1 overflow-hidden"
        >
            <Watermark
                position="top-right"
                icon={
                    <ThronesIcon
                        name={faction}
                        className={classNames("-mt-8 mr-48 text-[8rem] sm:text-[10rem]", watermarkClasses[faction])}
                    />
                }
            />
            <div className="relative flex h-20">
                <div
                    className={classNames(
                        "text-2xl sm:text-3xl font-cinzel tracking-widest p-4 flex items-center gap-2 grow"
                    )}
                >
                    {factionNames[faction]}
                </div>
                <div className="flex items-center gap-2 text-lg py-4 px-2 text-foreground">
                    {isLoadingReviews ? <Skeleton className="h-full w-32 rounded-sm" /> : <div>{percent}% Tested</div>}
                </div>
            </div>
            <div className="relative">
                <div
                    ref={scrollRef}
                    className="w-full h-64 sm:h-72 md:h-80 flex overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [overflow-anchor:none] gap-2"
                >
                    {cards.map((card) => (
                        <motion.div
                            key={parseCardCode(false, card.project, card.number)}
                            layout
                            transition={reorderTransition}
                            className={classNames(
                                "snap-start",
                                card.type === "plot"
                                    ? "w-64 sm:w-72 md:w-80 aspect-[333/240]"
                                    : "h-full aspect-[240/333]"
                            )}
                        >
                            <PermissionedLink
                                to={`/project/${card.project}/${card.number}`}
                                requires={Permission.READ_LATEST_CARDS}
                                className="group block w-full h-full scale-[0.98] transition-transform duration-200 ease-out hover:scale-100 hover:z-20 relative"
                            >
                                <ProjectContentCard
                                    card={card}
                                    stats={isLoadingReviews ? undefined : cardStats.get(card.number)}
                                    release={cardReleases.get(card.number)}
                                    progress={cardProgress.get(card.number)}
                                    isReleaseBound={cardIsReleaseBound.get(card.number) ?? false}
                                    isNextRelease={
                                        !!nextReleaseCode && cardReleases.get(card.number)?.code === nextReleaseCode
                                    }
                                    showReviewBadge={showReviewBadge}
                                    showProgressBadge={showProgressBadge}
                                />
                            </PermissionedLink>
                        </motion.div>
                    ))}
                </div>
            </div>
        </HighlightTarget>
    );
}
type FactionCarouselProps = {
    faction: Faction;
    cards: IPlaytestCard[];
    cardStats: Map<number, CardStats>;
    cardReleases: Map<number, IProjectRelease>;
    cardProgress: Map<number, CardLaneBreakdown>;
    cardIsReleaseBound: Map<number, boolean>;
    nextReleaseCode?: string;
    sortBy: SortOption;
    showReviewBadge: boolean;
    showProgressBadge: boolean;
    isLoadingReviews: boolean;
};

function FactionCarouselSkeleton({ count }: FactionCarouselSkeletonProps) {
    return (
        <div className="relative border border-content3 bg-content1 overflow-hidden">
            <div className="relative flex h-20 items-center">
                <div className="p-4 grow">
                    <Skeleton className="w-48 max-w-full h-8 rounded-md" />
                </div>
                <div className="py-4 px-2">
                    <Skeleton className="w-28 h-7 rounded-md" />
                </div>
            </div>
            <div className="w-full h-64 sm:h-72 md:h-80 flex overflow-hidden gap-2 p-2">
                {[...Array(count)].map((_, i) => (
                    <div key={i} className="h-full aspect-[240/333] shrink-0">
                        <Skeleton className="w-full h-full rounded-xl" />
                    </div>
                ))}
            </div>
        </div>
    );
}
type FactionCarouselSkeletonProps = {
    count: number;
};

const ProjectContentCard = memo(function ProjectContentCard({
    card,
    stats,
    release,
    progress,
    isReleaseBound,
    isNextRelease,
    showReviewBadge,
    showProgressBadge
}: ProjectContentCardProps) {
    const navigate = useNavigate();

    const goToRelease = (event: React.MouseEvent) => {
        if (!release) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const path = `/project/${card.project}?tab=releases`;
        if (event.ctrlKey || event.metaKey) {
            window.open(path, "_blank");
            return;
        }
        navigate(path, { state: { highlight: highlightTarget.release(card.project, release.code) } });
    };

    const openReleaseInNewTab = (event: React.MouseEvent) => {
        if (!release || event.button !== 1) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        window.open(`/project/${card.project}?tab=releases`, "_blank");
    };

    const renderCard = useMemo(() => renderPlaytestingCard(card), [card]);
    const previousReviews = stats ? stats.total - stats.latest : 0;

    return (
        <div className="relative h-full flex justify-center items-center drop-shadow-xl">
            <div className="relative w-full h-full flex justify-center items-center transition-[filter] duration-200">
                {card.released ? (
                    <CardImage card={card} />
                ) : (
                    <div className="relative w-full">
                        <CardPreview card={renderCard} rounded />
                    </div>
                )}
            </div>
            <div className="absolute top-0 right-0 m-2 z-10 flex items-center gap-1 transition-opacity duration-200 group-hover:opacity-50 hover:!opacity-100">
                {card.draft && isReleaseBound && (
                    <TouchTooltip
                        content={
                            <div className="max-w-64 px-1 py-0.5">
                                <div className="text-sm font-cinzel">
                                    <FontAwesomeIcon icon={faFlagCheckered} /> Marked For Release
                                </div>
                                <div className="text-xs">
                                    This pack is out of planning, so this draft is refinement in progress — it won't
                                    trigger a playtesting update.
                                </div>
                            </div>
                        }
                    >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70">
                            <FontAwesomeIcon icon={faFlagCheckered} className="text-lg text-primary" />
                        </div>
                    </TouchTooltip>
                )}
                {card.draft && !isReleaseBound && (
                    <TouchTooltip
                        content={
                            <div className="max-w-64 px-1 py-0.5">
                                <div className="text-sm font-cinzel">
                                    <FontAwesomeIcon icon={faFeather} /> New Version Being Drafted
                                </div>
                                <div className="text-xs">
                                    The maesters are penning a revised version of this card — not yet in playtesting,
                                    it will not enter the field until published with the next Playtesting Update.
                                </div>
                            </div>
                        }
                    >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70 animate-pulse">
                            <FontAwesomeIcon icon={faFeather} className="text-lg text-primary" />
                        </div>
                    </TouchTooltip>
                )}
                {isNextRelease && (
                    <TouchTooltip
                        content={
                            <div className="max-w-64 px-1 py-0.5">
                                <div className="text-sm font-cinzel">
                                    <FontAwesomeIcon icon={faCrosshairs} /> High Priority
                                </div>
                                <div className="text-xs">This card is slotted for the next release & needs focus.</div>
                            </div>
                        }
                    >
                        <div
                            onClick={goToRelease}
                            onAuxClick={openReleaseInNewTab}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70 cursor-pointer"
                        >
                            <FontAwesomeIcon
                                icon={faCrosshairs}
                                className="text-lg text-primary drop-shadow-[0_0_4px_rgba(197,160,89,0.9)]"
                            />
                        </div>
                    </TouchTooltip>
                )}
            </div>
            {showProgressBadge && progress && (
                <div className={CORNER_BADGE_CLASS}>
                    <TouchTooltip content={<CardProgressBreakdown progress={progress} />}>
                        <ProgressRing value={progress.overall} className="size-9">
                            <div className="flex items-center justify-center size-7 rounded-full bg-black/60 text-[0.6rem] font-bold text-primary">
                                {Math.round(progress.overall)}%
                            </div>
                        </ProgressRing>
                    </TouchTooltip>
                </div>
            )}
            {showReviewBadge && stats && (
                <div className={CORNER_BADGE_CLASS}>
                    <TouchTooltip
                        content={
                            <div className="max-w-64 px-1 py-0.5">
                                <div className="text-sm font-cinzel">
                                    <FontAwesomeIcon icon={faScroll} /> Reviews
                                </div>
                                <div className="text-xs">
                                    {stats.latest} review{stats.latest !== 1 ? "s" : ""} for the latest version.
                                </div>
                                {previousReviews > 0 && (
                                    <div className="text-xs">
                                        {previousReviews} review{previousReviews !== 1 ? "s" : ""} for previous
                                        versions.
                                    </div>
                                )}
                            </div>
                        }
                    >
                        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70">
                            <FontAwesomeIcon
                                icon={faScroll}
                                className="text-lg text-primary drop-shadow-[0_0_4px_rgba(197,160,89,0.9)]"
                            />
                            <div className="absolute -bottom-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[0.65rem] leading-4 text-center font-bold">
                                {stats.total}
                            </div>
                        </div>
                    </TouchTooltip>
                </div>
            )}
        </div>
    );
});

type ProjectContentCardProps = {
    card: IPlaytestCard;
    stats?: CardStats;
    release?: IProjectRelease;
    progress?: CardLaneBreakdown;
    isReleaseBound: boolean;
    isNextRelease?: boolean;
    showReviewBadge: boolean;
    showProgressBadge: boolean;
};
