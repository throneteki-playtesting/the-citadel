import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate } from "framer-motion";
import { IPlaytestCard } from "common/models/cards";
import FlyingCard, { CardControl } from "./flyingCard";
import { FLIGHT, LIT, pileCardPose, plotTurn, towardsPile } from "./pilePose";

const STAGGER_S = 0.08;
// The Favoured lands last, so it settles on top
const landingDelay = (count: number, rank: number) => (count - 1 - rank) * STAGGER_S;
const ABOVE_PAGE = 5000;
// How long the pile may take to show the cards before they are let go of anyway
const PATIENCE_MS = 5000;

/** A card just added, with where it was drawn on its way in - and which place it takes in the slot */
export type IncomingCard = {
    card: IPlaytestCard;
    rank: number;
    from: DOMRect;
    /** How the card will lie in the slot */
    isUpright: boolean;
    /** How it was drawn where it left from - a plot is turned on its way if that differs */
    isFromUpright: boolean;
    issues: string[];
    /** What sat over the card where it was drawn - the stack's menu takes its place on the way */
    fromControl: CardControl;
};

// The cards a modal has just added, carried from where they sat there onto their slot's pile - the Favoured last, so it lands on top
export default function IncomingCards({ cards, pile, isReady, onDone }: IncomingCardsProps) {
    const nodes = useRef(new Map<number, HTMLElement>());
    const hasFlown = useRef(false);
    const [isMorphing, setIsMorphing] = useState(false);
    const [stackWidth] = useState(() => Math.min(pile.clientWidth, pile.clientHeight));

    // The pile's own copies are in by now, unseen until these land on them in the pose they were dealt
    useLayoutEffect(() => {
        if (!isReady || hasFlown.current) {
            return;
        }
        hasFlown.current = true;
        setIsMorphing(true);
        const count = pile.querySelectorAll("[data-stack-index]").length;
        const resting = new Set<HTMLElement>();
        const flights = cards.flatMap(({ card, rank, from, isFromUpright, isUpright }) => {
            const node = nodes.current.get(rank);
            const stackIndex = count - 1 - rank;
            if (!node) {
                return [];
            }
            const home = pile.querySelector<HTMLElement>(`[data-stack-index="${stackIndex}"]`);
            if (home) {
                home.style.visibility = "hidden";
                resting.add(home);
            }
            const turn = plotTurn(card.type === "plot", isFromUpright, isUpright);
            const timing = { ...FLIGHT, delay: landingDelay(cards.length, rank) };
            const shade = towardsPile(from, pileCardPose(pile, stackIndex), turn).filter;
            // Aimed at where the pile is each frame, so a slot still settling into its shape never leaves the card short
            const travel = animate(0, 1, {
                ...timing,
                onUpdate: (progress) => {
                    const to = towardsPile(from, pileCardPose(pile, stackIndex), turn);
                    const scale = 1 + (to.scale - 1) * progress;
                    node.style.transform = `translate(${to.x * progress}px, ${to.y * progress}px) scale(${scale}) rotate(${to.rotate * progress}deg)`;
                }
            });
            return [travel, animate(node, { filter: [LIT, shade] }, timing)];
        });
        void Promise.all(flights).then(() => {
            resting.forEach((home) => home.style.removeProperty("visibility"));
            onDone();
        });
    }, [isReady, cards, pile, onDone]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!hasFlown.current) {
                onDone();
            }
        }, PATIENCE_MS);
        return () => clearTimeout(timer);
    }, [onDone]);

    return createPortal(
        <>
            {cards.map(({ card, rank, from, isFromUpright, issues, fromControl }) => (
                <FlyingCard
                    key={rank}
                    ref={(node) => {
                        if (node) {
                            nodes.current.set(rank, node);
                        } else {
                            nodes.current.delete(rank);
                        }
                    }}
                    card={card}
                    rank={rank}
                    isUpright={isFromUpright}
                    from={from}
                    issues={issues}
                    fromControl={fromControl}
                    toControl="menu"
                    stackWidth={stackWidth}
                    isMorphing={isMorphing}
                    transition={{ ...FLIGHT, delay: landingDelay(cards.length, rank) }}
                    zIndex={ABOVE_PAGE + cards.length - rank}
                />
            ))}
        </>,
        document.body
    );
}

type IncomingCardsProps = {
    cards: IncomingCard[];
    /** The pile the cards are bound for */
    pile: HTMLElement;
    /** The pile holds the cards, in their places - so the poses they will rest in can be read */
    isReady: boolean;
    /** Every card has landed and the pile shows them itself */
    onDone: () => void;
};
