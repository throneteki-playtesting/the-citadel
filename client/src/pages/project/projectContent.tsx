import { CardPreview } from "@agot/card-preview";
import { factionNames, parseCardCode, renderPlaytestingCard } from "common/utils";
import { Link, Tooltip } from "@heroui/react";
import { Faction, IPlaytestCard } from "common/models/cards";
import CardImage from "../../components/cardImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faStar } from "@fortawesome/free-solid-svg-icons";
import { useGetCardsQuery } from "../../api";
import { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import ThronesIcon from "../../components/thronesIcon";

const ProjectContent = ({ cards = [] }: ProjectContentProps) => {
    const cardsByFaction = useMemo(() => cards.reduce<Map<Faction, IPlaytestCard[]>>((map, card) => {
        const array = map.get(card.faction) ?? [];
        array.push(card);
        map.set(card.faction, array);
        return map;
    }, new Map<Faction, IPlaytestCard[]>), [cards]);

    return (
        <div>
            {[...cardsByFaction.entries()].map(([faction, cards]) => <FactionCarousel key={faction} faction={faction} cards={cards} />)}
        </div>
    );
};

type ProjectContentProps = { cards?: IPlaytestCard[]}

function FactionCarousel({ faction, cards }: FactionCarouselProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

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
            <div className={classNames("text-xl tracking-widest w-full p-4 flex items-center gap-2")}><ThronesIcon name={faction} className="text-3xl"/> {factionNames[faction]}</div>
            <div className="relative">
                <button
                    onClick={() => scroll("left")}
                    className={classNames(
                        "absolute left-0 top-0 h-full w-10 z-10 flex items-center justify-center bg-black/10 hover:bg-black/25 active:bg-black/40 transition-all duration-300",
                        canScrollLeft ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                >
                    <FontAwesomeIcon icon={faChevronLeft} className="text-black drop-shadow text-xl" />
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
                    onClick={() => scroll("right")}
                    className={classNames(
                        "absolute right-0 top-0 h-full w-10 z-10 flex items-center justify-center bg-black/10 hover:bg-black/25 active:bg-black/40 transition-all duration-300",
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