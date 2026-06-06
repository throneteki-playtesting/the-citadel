import { CardPreview } from "@agot/card-preview";
import { factionNames, parseCardCode, renderPlaytestingCard } from "common/utils";
import { Divider, Link, Skeleton, Tooltip } from "@heroui/react";
import { Faction, IPlaytestCard } from "common/models/cards";
import CardImage from "../../components/cardImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import { useGetCardsQuery, useGetReviewsQuery } from "../../api";
import { useMemo } from "react";
import classNames from "classnames";
import ThronesIcon from "../../components/thronesIcon";
import { IProject } from "common/models/projects";
import { watermarkClasses } from "../../constants";
import Error from "../../components/error";

export default function ProjectContent({ project }: ProjectContentProps) {
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
                {Object.keys(project.cardCount).map((faction) => <Skeleton key={faction} className="w-full h-64 sm:h-72 rounded-md"/>)}
            </div>
        );
    }

    if (!data) {
        return <Error label="The Citadel's records could not be retrieved..." content="Something went wrong loading the cards for this project. Please try again or alert an administrator." />;
    }

    return (
        <div className="flex flex-col gap-2">
            {[...cardsByFaction.entries()].map(([faction, cards]) => <FactionCarousel key={faction} faction={faction} cards={cards} />)}
        </div>
    );
};

type ProjectContentProps = { project: IProject }

function FactionCarousel({ faction, cards }: FactionCarouselProps) {
    const { data: reviewsData, isLoading: isLoadingReviewsData } = useGetReviewsQuery({ filter: cards.map((card) => ({ project: card.project, number: card.number })) });

    const { reviews, decks } = useMemo(() => {
        const reviews = reviewsData?.total ?? 0;
        const decks = new Set(reviewsData?.items.reduce<string[]>((decks, review) => [...decks, ...review.decks], [])).size ?? 0;

        return { reviews, decks };
    }, [reviewsData?.items, reviewsData?.total]);

    return (
        <div className={classNames("relative border border-content3 overflow-hidden")}>
            <div className="absolute -top-8 right-48 flex items-center justify-center pointer-events-none select-none">
                <ThronesIcon name={faction} className={classNames("text-[8rem] sm:text-[10rem]", watermarkClasses[faction])}/>
            </div>
            <div className="flex h-20">
                <div className={classNames("text-2xl sm:text-3xl font-cinzel tracking-widest p-4 flex items-center gap-2 grow")}>
                    {factionNames[faction]}
                </div>
                <div className="flex items-center gap-2 text-lg py-4 px-2 text-foreground">
                    {isLoadingReviewsData ? <Skeleton className="h-full w-32 rounded-sm" /> : <div>{reviews} Reviews</div>}
                    <Divider orientation="vertical"/>
                    {isLoadingReviewsData ? <Skeleton className="h-full w-32 rounded-sm" /> : <div>{decks} Decks</div>}
                </div>
            </div>
            <div className="relative">
                <div className="w-full h-64 sm:h-72 md:h-80 flex overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden gap-2 p-2">
                    {
                        cards.map((card) => (
                            <Link key={parseCardCode(false, card.project, card.number)} href={`/project/${card.project}/${card.number}`}>
                                <div className={classNames("snap-start", card.type === "plot" ? "w-64 sm:w-72 md:w-80 aspect-[333/240]" : "h-full aspect-[240/333]")}>
                                    <ProjectContentCard card={card} />
                                </div>
                            </Link>))
                    }
                </div>
            </div>
        </div>
    );
}
type FactionCarouselProps = {
    faction: Faction;
    cards: IPlaytestCard[];
}

function ProjectContentCard({ card }: ProjectContentCardProps) {
    const { data: draftData } = useGetCardsQuery({ filter: { project: card.project, number: card.number, draft: true } });
    const hasDraft = useMemo(() => draftData && draftData.total > 0, [draftData]);

    if (card.release) {
        return <CardImage card={card} />;
    }
    return <div className="w-full flex justify-center items-center drop-shadow-xl">
        <div className="relative w-full">
            <CardPreview
                card={renderPlaytestingCard(card)}
                rounded
                className="transition-all"
            />
            <Tooltip placement="bottom" content="New version being drafted" className={classNames("transition-opacity duration-500", { "opacity-0": !hasDraft })}>
                <FontAwesomeIcon icon={faStar} className={classNames("absolute top-0 right-0 m-2 text-3xl text-gray-500 transition-opacity duration-500", hasDraft ? "opacity-75" : "opacity-0")}/>
            </Tooltip>
        </div>
    </div>;
};

type ProjectContentCardProps = {
    card: IPlaytestCard
}