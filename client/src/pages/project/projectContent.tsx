import { CardPreview } from "@agot/card-preview";
import { factionNames, parseCardCode, renderPlaytestingCard } from "common/utils";
import { Card, Divider, Link, Skeleton, Tooltip } from "@heroui/react";
import { Faction, IPlaytestCard } from "common/models/cards";
import CardImage from "../../components/cardImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faStar } from "@fortawesome/free-solid-svg-icons";
import { useGetCardsQuery, useGetReviewsQuery } from "../../api";
import { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import ThronesIcon from "../../components/thronesIcon";
import { IProject } from "common/models/projects";

const ProjectContent = ({ project }: ProjectContentProps) => {
    const { data, isLoading } = useGetCardsQuery({ filter: { project: project.number, latest: true } });

    const cardsByFaction = useMemo(() => data?.items.reduce<Map<Faction, IPlaytestCard[]>>((map, card) => {
        const array = map.get(card.faction) ?? [];
        array.push(card);
        map.set(card.faction, array);
        return map;
    }, new Map<Faction, IPlaytestCard[]>) ?? new Map<Faction, IPlaytestCard[]>, [data?.items]);

    if (isLoading) {
        return (
            <div className="space-y-2">
                {Object.keys(project.cardCount).map(() => <Skeleton className="w-full h-64 rounded-md"/>)}
            </div>
        );
    }

    if (!data) {
        // TODO: Improve
        return (
            <div>Error</div>
        );
    }

    return (
        <Card className="bg-content1/10">
            {[...cardsByFaction.entries()].map(([faction, cards]) => <FactionCarousel key={faction} faction={faction} cards={cards} />)}
        </Card>
    );
};

type ProjectContentProps = { project: IProject }

function FactionCarousel({ faction, cards }: FactionCarouselProps) {
    const { data: reviewsData, isLoading: isLoadingReviewsData } = useGetReviewsQuery({ filter: cards.map((card) => ({ project: card.project, number: card.number })) });
    const containerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const { reviews, decks } = useMemo(() => {
        const reviews = reviewsData?.total ?? 0;
        const decks = new Set(reviewsData?.items.reduce<string[]>((decks, review) => [...decks, ...review.decks], [])).size ?? 0;

        return { reviews, decks };
    }, [reviewsData?.items, reviewsData?.total]);

    const updateScrollButtons = () => {
        const el = containerRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
    };

    useEffect(() => {
        updateScrollButtons();
    }, [cards]);

    const scroll = (direction: "left" | "right") => {
        containerRef.current?.scrollBy({ left: direction === "left" ? -300 : 300, behavior: "smooth" });
    };

    return (
        <div className={factionClasses[faction]}>
            <div className="flex">
                <div className={classNames("text-xl tracking-widest p-4 flex items-center gap-2 grow")}>
                    <ThronesIcon name={faction} className="text-3xl"/> {factionNames[faction]}
                </div>
                <div className="flex items-center gap-2 text-lg py-4 px-2 text-foreground">
                    {isLoadingReviewsData ? <Skeleton className="h-full w-32 rounded-sm" /> : <div>{reviews} Reviews</div>}
                    <Divider orientation="vertical"/>
                    {isLoadingReviewsData ? <Skeleton className="h-full w-32 rounded-sm" /> : <div>{decks} Decks</div>}
                </div>
            </div>
            <div className="relative">
                <button
                    onPointerDown={() => scroll("left")}
                    className={classNames(
                        "cursor-pointer absolute left-0 top-0 h-full w-10 z-10 flex items-center justify-center bg-black/10 hover:bg-black/25 active:bg-black/40 transition-all duration-300",
                        canScrollLeft ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                >
                    <FontAwesomeIcon icon={faChevronLeft} className="text-black drop-shadow text-3xl" />
                </button>
                <div ref={containerRef} onScroll={updateScrollButtons} className="w-full h-64 sm:h-72 md:h-80 flex overflow-x-auto scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden">
                    {cards.map((card) => (
                        <Link key={parseCardCode(false, card.project, card.number)} href={`/project/${card.project}/${card.number}`}>
                            <div className={classNames("snap-start", card.type === "plot" ? "w-64 sm:w-72 md:w-80 aspect-[333/240]" : "h-full aspect-[240/333]")}>
                                <ProjectContentCard card={card} />
                            </div>
                        </Link>))}
                </div>
                <button
                    onPointerDown={() => scroll("right")}
                    className={classNames(
                        "cursor-pointer absolute right-0 top-0 h-full w-10 z-10 flex items-center justify-center bg-black/10 hover:bg-black/25 active:bg-black/40 transition-all duration-300",
                        canScrollRight ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                >
                    <FontAwesomeIcon icon={faChevronRight} className="text-black drop-shadow text-3xl" />
                </button>
            </div>
        </div>
    );
}
type FactionCarouselProps = { faction: Faction, cards: IPlaytestCard[] }

const factionClasses: Record<Faction, string> = {
    baratheon: "bg-baratheon/5",
    greyjoy: "bg-greyjoy/5",
    lannister: "bg-lannister/5",
    martell: "bg-martell/5",
    thenightswatch: "bg-thenightswatch/5",
    stark: "bg-stark/5",
    targaryen: "bg-targaryen/5",
    tyrell: "bg-tyrell/5",
    neutral: "bg-neutral/5"
};

const ProjectContentCard = ({ card }: ProjectContentCardProps) => {
    const { data: draftData } = useGetCardsQuery({ filter: { project: card.project, number: card.number, draft: true } });
    const hasDraft = useMemo(() => draftData && draftData.total > 0, [draftData]);

    if (card.release) {
        return <CardImage card={card} />;
    }
    return <div className="w-full flex justify-center items-center">
        <div className="relative w-full">
            <CardPreview
                card={renderPlaytestingCard(card)}
                rounded={false}
                className="transition-all"
            />
            <Tooltip placement="bottom" content="New version being drafted" className={classNames("transition-opacity duration-500", { "opacity-0": !hasDraft })}>
                <FontAwesomeIcon icon={faStar} className={classNames("absolute top-0 right-0 m-2 text-3xl text-gray-500 transition-opacity duration-500", hasDraft ? "opacity-75" : "opacity-0")}/>
            </Tooltip>
        </div>
    </div>;
};

type ProjectContentCardProps = { card: IPlaytestCard }

export default ProjectContent;