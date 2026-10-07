import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate } from "framer-motion";
import { IPlaytestCard } from "common/models/cards";
import FlyingCard, { CardControl } from "./flyingCard";
import { plotTurn } from "./pilePose";

// In step with the pages' own slide, which it crosses
const TRANSIT = { duration: 0.5, ease: "easeInOut" } as const;
const ABOVE_PAGE = 5000;
const FRAMES_TO_WAIT = 10;
export const SLIDING_PAGE_ATTRIBUTE = "data-sliding-page";

// Where a node will rest once its page has finished sliding in, rather than wherever the slide has it now
function settledRect(node: HTMLElement) {
    const rect = node.getBoundingClientRect();
    const page = node.closest<HTMLElement>(`[${SLIDING_PAGE_ATTRIBUTE}]`);
    const shift = page ? new DOMMatrix(getComputedStyle(page).transform).e : 0;
    return new DOMRect(rect.left - shift, rect.top, rect.width, rect.height);
}

// A card carried from one page of the modal to another, over the slide between them - both ends hold their own until it lands
export default function TransitCard({
    card,
    rank,
    isUpright,
    issues,
    from,
    fromControl,
    toControl,
    stackWidth,
    source,
    isSourceHeld = false,
    getTarget,
    onDone
}: TransitCardProps) {
    const nodeRef = useRef<HTMLDivElement>(null);
    const [isMorphing, setIsMorphing] = useState(false);
    const latest = useRef({ source, isSourceHeld, getTarget, onDone, isPlot: card.type === "plot", isUpright });
    useLayoutEffect(() => {
        latest.current = { source, isSourceHeld, getTarget, onDone, isPlot: card.type === "plot", isUpright };
    });

    useLayoutEffect(() => {
        const node = nodeRef.current;
        if (!node) {
            return;
        }
        let target: HTMLElement | undefined;
        let frame = 0;
        let isCancelled = false;
        let flight: ReturnType<typeof animate> | undefined;
        const restore = () => {
            if (!latest.current.isSourceHeld) {
                latest.current.source?.style.removeProperty("visibility");
            }
            target?.style.removeProperty("visibility");
        };
        const finish = () => {
            if (isCancelled) {
                return;
            }
            restore();
            latest.current.onDone();
        };
        const fly = (attempt: number) => {
            target = latest.current.getTarget() ?? undefined;
            if (!target) {
                if (attempt < FRAMES_TO_WAIT) {
                    frame = requestAnimationFrame(() => fly(attempt + 1));
                } else {
                    finish();
                }
                return;
            }
            target.style.visibility = "hidden";
            const destination = target;
            const settled = settledRect(destination);
            // A plot drawn upright and one drawn on its side are the same card, so it is turned on the way
            const turn = plotTurn(latest.current.isPlot, latest.current.isUpright, settled.height > settled.width);
            setIsMorphing(true);
            // Aimed at where the target is each frame, so whatever it is still settling into never leaves the card short
            flight = animate(0, 1, {
                ...TRANSIT,
                onUpdate: (progress) => {
                    const to = settledRect(destination);
                    const x = (to.left + to.width / 2 - (from.left + from.width / 2)) * progress;
                    const y = (to.top + to.height / 2 - (from.top + from.height / 2)) * progress;
                    const scale = 1 + (to.width / (turn === 0 ? from.width : from.height) - 1) * progress;
                    node.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${turn * progress}deg)`;
                }
            });
            void flight.then(finish);
        };
        latest.current.source?.style.setProperty("visibility", "hidden");
        fly(0);
        return () => {
            isCancelled = true;
            cancelAnimationFrame(frame);
            flight?.stop();
            restore();
        };
    }, [from]);

    return createPortal(
        <FlyingCard
            ref={nodeRef}
            card={card}
            rank={rank}
            isUpright={isUpright}
            from={from}
            issues={issues}
            fromControl={fromControl}
            toControl={toControl}
            stackWidth={stackWidth}
            isMorphing={isMorphing}
            transition={TRANSIT}
            zIndex={ABOVE_PAGE}
        />,
        document.body
    );
}

export type TransitCardProps = {
    card: IPlaytestCard;
    rank: number;
    isUpright: boolean;
    issues: string[];
    from: DOMRect;
    fromControl: CardControl;
    toControl: CardControl;
    /** The width a card is drawn at in its stack */
    stackWidth: number;
    /** Where the card sits now, hidden while its copy is away */
    source?: HTMLElement;
    /** The source stays hidden once the card has arrived, for whoever is holding the card there to show it again */
    isSourceHeld?: boolean;
    /** Where it is going - asked for once its page has mounted */
    getTarget: () => HTMLElement | null | undefined;
    onDone: () => void;
};
