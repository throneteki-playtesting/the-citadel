import { CardPreview } from "@agot/card-preview";
import { factionNames, parseCardCode, renderPlaytestingCard } from "common/utils";
import { Select, SelectItem, Skeleton } from "@heroui/react";
import { Faction, IPlaytestCard } from "common/models/cards";
import Permission from "common/models/permissions";
import CardImage from "../../components/cardImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useGetCardsQuery, useGetReviewsQuery, useGetSlotsQuery } from "../../api";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PermissionedLink from "../../components/permissionedLink";
import { HighlightTarget } from "../../components/highlightTarget";
import classNames from "classnames";
import ThronesIcon from "../../components/thronesIcon";
import SectionTitle from "../../components/sectionTitle";
import { IProject, IProjectRelease } from "common/models/projects";
import { highlightTarget, watermarkClasses } from "../../constants";
import Error from "../../components/error";
import { faCrosshairs, faFeather, faScroll } from "@fortawesome/free-solid-svg-icons";
import { TouchTooltip } from "../../components/touchTooltip";
import Watermark from "../../components/watermark";

const sortOptions: Record<SortOption, string> = {
    number: "Card Number",
    name: "Card Name",
    reviews: "Fewest Reviews",
    priority: "Testing Priority"
};

const REORDER_TRANSITION = { duration: 0.4, ease: [0.65, 0, 0.35, 1] } as const;

function compareByReviews(cardStats: Map<number, CardStats>, a: IPlaytestCard, b: IPlaytestCard) {
    const statA = cardStats.get(a.number) ?? { latest: 0, total: 0 };
    const statB = cardStats.get(b.number) ?? { latest: 0, total: 0 };
    return statA.latest - statB.latest || statA.total - statB.total || a.number - b.number;
}

export default function ProjectContent({ project }: ProjectContentProps) {
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, latest: true } });
    const { data: reviewsData, isLoading: isLoadingReviews } = useGetReviewsQuery({ filter: { project: project.number } });
    const { data: slotsData } = useGetSlotsQuery({ project: project.number });
    const [sortBy, setSortBy] = useState<SortOption>("number");
    const [isSorting, startSorting] = useTransition();
    const { state } = useLocation();

    useEffect(() => {
        const sort = state?.sortBy as SortOption;
        if (sort && sortOptions[sort]) {
            startSorting(() => setSortBy(sort));
        }
    }, [state]);

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

    const releasesByCode = useMemo(() => new Map(project.releases.map((release) => [release.code, release])), [project.releases]);

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

    const cardsByFaction = useMemo(() => {
        const map = new Map<Faction, IPlaytestCard[]>();
        for (const card of data?.items ?? []) {
            const array = map.get(card.faction) ?? [];
            array.push(card);
            map.set(card.faction, array);
        }

        const comparators: Record<SortOption, (a: IPlaytestCard, b: IPlaytestCard) => number> = {
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
            }
        };
        for (const cards of map.values()) {
            cards.sort(comparators[sortBy]);
        }
        return map;
    }, [data?.items, cardStats, cardReleases, sortBy]);

    if (!isLoading && !data) {
        return <Error label="The Citadel's records could not be retrieved..." content="Something went wrong loading the cards for this project. Please try again or alert an administrator." />;
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <SectionTitle className="sm:flex-1">
                    Project Cards
                </SectionTitle>
                <Select
                    label="Sort by..."
                    selectedKeys={[sortBy]}
                    onSelectionChange={(keys) => startSorting(() => setSortBy([...keys][0] as SortOption))}
                    className="w-full max-w-64"
                    classNames={{ value: "font-cinzel" }}
                    size="sm"
                    disallowEmptySelection
                    isDisabled={isLoading}
                >
                    {Object.entries(sortOptions).map(([key, label]) => <SelectItem key={key} className="font-cinzel">{label}</SelectItem>)}
                </Select>
            </div>
            {isLoading ? (
                <div className="flex flex-col gap-2">
                    {Object.entries(project.cardCount).filter(([, count]) => count > 0).map(([faction, count]) => <FactionCarouselSkeleton key={faction} count={count} />)}
                </div>
            ) : (
                <div className={classNames("flex flex-col gap-2 transition-opacity", { "opacity-50 pointer-events-none": isSorting })}>
                    {[...cardsByFaction.entries()].map(([faction, cards]) => (
                        <FactionCarousel
                            key={faction}
                            faction={faction}
                            cards={cards}
                            cardStats={cardStats}
                            cardReleases={cardReleases}
                            nextReleaseCode={nextReleaseCode}
                            sortBy={sortBy}
                            showReviewBadge={sortBy === "reviews"}
                            isLoadingReviews={isLoadingReviews || !reviewsData}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

type ProjectContentProps = { project: IProject }
type SortOption = "number" | "name" | "reviews" | "priority";
type CardStats = { latest: number, total: number };

function FactionCarousel({ faction, cards, cardStats, cardReleases, nextReleaseCode, sortBy, showReviewBadge, isLoadingReviews }: FactionCarouselProps) {
    const percent = useMemo(() => {
        const tested = cards.filter((card) => (cardStats.get(card.number)?.total ?? 0) > 0).length;
        return Math.round((tested / cards.length) * 100);
    }, [cards, cardStats]);

    const scrollRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    }, [sortBy]);

    return (
        <HighlightTarget targetId={highlightTarget.factionCarousel(cards[0].project, faction)} className="relative border border-content3 bg-content1 overflow-hidden">
            <Watermark position="top-right" icon={<ThronesIcon name={faction} className={classNames("-mt-8 mr-48 text-[8rem] sm:text-[10rem]", watermarkClasses[faction])}/>}/>
            <div className="relative flex h-20">
                <div className={classNames("text-2xl sm:text-3xl font-cinzel tracking-widest p-4 flex items-center gap-2 grow")}>
                    {factionNames[faction]}
                </div>
                <div className="flex items-center gap-2 text-lg py-4 px-2 text-foreground">
                    {isLoadingReviews ? <Skeleton className="h-full w-32 rounded-sm" /> : <div>{percent}% Tested</div>}
                </div>
            </div>
            <div className="relative">
                <div ref={scrollRef} className="w-full h-64 sm:h-72 md:h-80 flex overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [overflow-anchor:none] gap-2">
                    {cards.map((card) => (
                        <motion.div
                            key={parseCardCode(false, card.project, card.number)}
                            layout
                            transition={REORDER_TRANSITION}
                            className={classNames("snap-start", card.type === "plot" ? "w-64 sm:w-72 md:w-80 aspect-[333/240]" : "h-full aspect-[240/333]")}
                        >
                            <PermissionedLink to={`/project/${card.project}/${card.number}`} requires={Permission.READ_CARDS} className="group block w-full h-full scale-[0.98] transition-transform duration-200 ease-out hover:scale-100 hover:z-20 relative">
                                <ProjectContentCard
                                    card={card}
                                    stats={isLoadingReviews ? undefined : cardStats.get(card.number)}
                                    release={cardReleases.get(card.number)}
                                    isNextRelease={!!nextReleaseCode && cardReleases.get(card.number)?.code === nextReleaseCode}
                                    showReviewBadge={showReviewBadge}
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
    nextReleaseCode?: string;
    sortBy: SortOption;
    showReviewBadge: boolean;
    isLoadingReviews: boolean;
}

function FactionCarouselSkeleton({ count }: FactionCarouselSkeletonProps) {
    return (
        <div className="relative border border-content3 bg-content1 overflow-hidden">
            <div className="relative flex h-20 items-center">
                <div className="p-4 grow">
                    <Skeleton className="w-48 max-w-full h-8 rounded-md"/>
                </div>
                <div className="py-4 px-2">
                    <Skeleton className="w-28 h-7 rounded-md"/>
                </div>
            </div>
            <div className="w-full h-64 sm:h-72 md:h-80 flex overflow-hidden gap-2 p-2">
                {[...Array(count)].map((_, i) => (
                    <div key={i} className="h-full aspect-[240/333] shrink-0">
                        <Skeleton className="w-full h-full rounded-xl"/>
                    </div>
                ))}
            </div>
        </div>
    );
}
type FactionCarouselSkeletonProps = {
    count: number;
}

const ProjectContentCard = memo(function ProjectContentCard({ card, stats, release, isNextRelease, showReviewBadge }: ProjectContentCardProps) {
    const navigate = useNavigate();
    const { data: draftData } = useGetCardsQuery({ filter: { project: card.project, number: card.number, draft: true } });
    const hasDraft = useMemo(() => draftData && draftData.total > 0, [draftData]);

    const goToRelease = (event: React.MouseEvent) => {
        if (!release) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        navigate(`/project/${card.project}?tab=releases`, { state: { highlight: highlightTarget.release(card.project, release.code) } });
    };

    const renderCard = useMemo(() => renderPlaytestingCard(card), [card]);
    const previousReviews = stats ? stats.total - stats.latest : 0;

    return <div className="relative h-full flex justify-center items-center drop-shadow-xl">
        <div className="relative w-full h-full flex justify-center items-center transition-[filter] duration-200">
            {card.released ? <CardImage card={card} /> :
                <div className="relative w-full">
                    <CardPreview
                        card={renderCard}
                        rounded
                        className="transition-all"
                    />
                </div>
            }
        </div>
        <div className="absolute top-0 right-0 m-2 z-10 flex items-center gap-1 transition-opacity duration-200 group-hover:opacity-50 hover:!opacity-100">
            {hasDraft && (
                <TouchTooltip content={
                    <div className="max-w-64 px-1 py-0.5">
                        <div className="text-sm font-cinzel"><FontAwesomeIcon icon={faFeather}/> New Version Being Drafted</div>
                        <div className="text-xs">The maesters are penning a revised version of this card — it will not enter the field until published with the next Playtesting Update.</div>
                    </div>
                }>
                    <FontAwesomeIcon icon={faFeather} className="text-3xl text-foreground-500 opacity-90 animate-pulse"/>
                </TouchTooltip>
            )}
            {isNextRelease && (
                <TouchTooltip content={
                    <div className="max-w-64 px-1 py-0.5">
                        <div className="text-sm font-cinzel"><FontAwesomeIcon icon={faCrosshairs}/> High Priority</div>
                        <div className="text-xs">This card is slotted for the next release & needs focus.</div>
                    </div>
                }>
                    <div onClick={goToRelease} className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70 cursor-pointer">
                        <FontAwesomeIcon icon={faCrosshairs} className="text-lg text-primary drop-shadow-[0_0_4px_rgba(197,160,89,0.9)]"/>
                    </div>
                </TouchTooltip>
            )}
        </div>
        {showReviewBadge && stats && (
            <div className="absolute bottom-0 right-0 m-2 z-10 transition-opacity duration-200 group-hover:opacity-50 hover:!opacity-100">
                <TouchTooltip content={
                    <div className="max-w-64 px-1 py-0.5">
                        <div className="text-sm font-cinzel"><FontAwesomeIcon icon={faScroll}/> Reviews</div>
                        <div className="text-xs">{stats.latest} review{stats.latest !== 1 ? "s" : ""} for the latest version.</div>
                        {previousReviews > 0 && (
                            <div className="text-xs">{previousReviews} review{previousReviews !== 1 ? "s" : ""} for previous versions.</div>
                        )}
                    </div>
                }>
                    <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70">
                        <FontAwesomeIcon icon={faScroll} className="text-lg text-primary drop-shadow-[0_0_4px_rgba(197,160,89,0.9)]"/>
                        <div className="absolute -bottom-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[0.65rem] leading-4 text-center font-bold">
                            {stats.total}
                        </div>
                    </div>
                </TouchTooltip>
            </div>
        )}
    </div>;
});

type ProjectContentCardProps = {
    card: IPlaytestCard;
    stats?: CardStats;
    release?: IProjectRelease;
    isNextRelease?: boolean;
    showReviewBadge: boolean;
}