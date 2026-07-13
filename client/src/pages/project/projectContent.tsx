import { CardPreview } from "@agot/card-preview";
import { factionNames, hasPermission, parseCardCode, renderPlaytestingCard } from "common/utils";
import { Select, SelectItem, Skeleton } from "@heroui/react";
import { Faction, IPlaytestCard } from "common/models/cards";
import Permission from "common/models/permissions";
import CardImage from "../../components/cardImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useGetCardsQuery, useGetReviewsQuery } from "../../api";
import { memo, useEffect, useMemo, useState, useTransition } from "react";
import { useLocation } from "react-router-dom";
import PermissionedLink from "../../components/permissionedLink";
import { HighlightTarget } from "../../components/highlightTarget";
import classNames from "classnames";
import ThronesIcon from "../../components/thronesIcon";
import SectionTitle from "../../components/sectionTitle";
import { IProject } from "common/models/projects";
import { highlightTarget, watermarkClasses } from "../../constants";
import Error from "../../components/error";
import { faFeather, faScroll } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../hooks/useAuth";
import { TouchTooltip } from "../../components/touchTooltip";
import Watermark from "../../components/watermark";

const sortOptions: Record<SortOption, string> = {
    number: "Card Number",
    name: "Card Name",
    priority: "Testing Priority"
};

export default function ProjectContent({ project }: ProjectContentProps) {
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, latest: true } });
    const { data: reviewsData, isLoading: isLoadingReviews } = useGetReviewsQuery({ filter: { project: project.number } });
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

    const cardsByFaction = useMemo(() => {
        const map = new Map<Faction, IPlaytestCard[]>();
        for (const card of data?.items ?? []) {
            const array = map.get(card.faction) ?? [];
            array.push(card);
            map.set(card.faction, array);
        }

        const comparators: Record<SortOption, (a: IPlaytestCard, b: IPlaytestCard) => number> = {
            priority: (a, b) => {
                const statA = cardStats.get(a.number) ?? { latest: 0, total: 0 };
                const statB = cardStats.get(b.number) ?? { latest: 0, total: 0 };
                return statA.latest - statB.latest || statA.total - statB.total || a.number - b.number;
            },
            number: (a, b) => a.number - b.number,
            name: (a, b) => a.name.localeCompare(b.name)
        };
        for (const cards of map.values()) {
            cards.sort(comparators[sortBy]);
        }
        return map;
    }, [data?.items, cardStats, sortBy]);

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
                    {[...cardsByFaction.entries()].map(([faction, cards]) => <FactionCarousel key={faction} faction={faction} cards={cards} cardStats={cardStats} isLoadingReviews={isLoadingReviews || !reviewsData} />)}
                </div>
            )}
        </div>
    );
};

type ProjectContentProps = { project: IProject }
type SortOption = "priority" | "number" | "name";
type CardStats = { latest: number, total: number };

function FactionCarousel({ faction, cards, cardStats, isLoadingReviews }: FactionCarouselProps) {
    const percent = useMemo(() => {
        const tested = cards.filter((card) => (cardStats.get(card.number)?.total ?? 0) > 0).length;
        return Math.round((tested / cards.length) * 100);
    }, [cards, cardStats]);

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
                <div className="w-full h-64 sm:h-72 md:h-80 flex overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden gap-2">
                    {cards.map((card) => (
                        <PermissionedLink key={parseCardCode(false, card.project, card.number)} to={`/project/${card.project}/${card.number}`} requires={Permission.READ_CARDS}>
                            <div className={classNames("snap-start", card.type === "plot" ? "w-64 sm:w-72 md:w-80 aspect-[333/240]" : "h-full aspect-[240/333]")}>
                                <ProjectContentCard card={card} stats={isLoadingReviews ? undefined : cardStats.get(card.number)} />
                            </div>
                        </PermissionedLink>
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

const ProjectContentCard = memo(function ProjectContentCard({ card, stats }: ProjectContentCardProps) {
    const { user } = useAuth();
    const { data: draftData } = useGetCardsQuery({ filter: { project: card.project, number: card.number, draft: true } });
    const hasDraft = useMemo(() => draftData && draftData.total > 0, [draftData]);

    const renderCard = useMemo(() => renderPlaytestingCard(card), [card]);
    const canReview = hasPermission(user, Permission.READ_REVIEWS, Permission.MAKE_REVIEWS);

    return <div className="relative h-full flex justify-center items-center drop-shadow-xl">
        {card.released ? <CardImage card={card} /> :
            <div className="relative w-full">
                <CardPreview
                    card={renderCard}
                    rounded
                    className="transition-all"
                />
            </div>
        }
        <div className="absolute top-0 right-0 m-2 z-10 flex items-center">
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
            {stats && stats.latest === 0 && canReview && (
                <TouchTooltip
                    content={stats.total > 0 ? (
                        <div className="max-w-64 px-1 py-0.5">
                            <div className="text-sm font-cinzel"><FontAwesomeIcon icon={faScroll}/> Verdicts Outdated</div>
                            <div className="text-xs">{stats.total} verdict{stats.total !== 1 ? "s were" : " was"} rendered for older versions of this card — the latest version awaits your review.</div>
                        </div>
                    ) : (
                        <div className="max-w-64 px-1 py-0.5">
                            <div className="text-sm font-cinzel"><FontAwesomeIcon icon={faScroll}/> No Verdict Rendered</div>
                            <div className="text-xs">No maester has reviewed this card — take it to the field and be the first to render a verdict!</div>
                        </div>
                    )}
                >
                    <FontAwesomeIcon icon={faScroll} className={classNames("text-3xl drop-shadow-md opacity-90 animate-pulse", stats.total > 0 ? "text-warning" : "text-danger")}/>
                </TouchTooltip>
            )}
        </div>
    </div>;
});

type ProjectContentCardProps = {
    card: IPlaytestCard;
    stats?: CardStats;
}