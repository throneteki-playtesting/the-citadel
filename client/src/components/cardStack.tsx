import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, TargetAndTransition, Transition } from "framer-motion";
import classNames from "classnames";
import { EASE_STANDARD } from "../constants";

const STACK_TRANSITION: Transition = { duration: 0.4, ease: EASE_STANDARD };
const INSTANT: Transition = { duration: 0 };

export default function CardStack<T>({
    cards,
    children: renderCard,
    selectedIndex = cards.length - 1,
    tilt,
    shadow,
    className,
    ...props
}: CardStackProps<T>) {
    return (
        <div className={classNames("relative", className)} {...props}>
            {cards.map((card, index) => (
                <StackedCard
                    key={index}
                    card={card}
                    renderCard={renderCard}
                    selectedIndex={selectedIndex}
                    index={index}
                    tilt={tilt}
                    shadow={shadow}
                />
            ))}
        </div>
    );
}

type CardStackProps<T> = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
    cards: T[];
    children: (card: T, index: number) => React.ReactNode;
    selectedIndex?: number;
    tilt?: TiltOptions;
    shadow?: boolean;
};

/**
 * One card of the stack. Every card holds the same place and is posed rather than moved between two
 * poses - stacked or thrown - which is what makes the throw run backwards for free on reversal.
 */
function StackedCard<T>({ card, renderCard, selectedIndex, index, tilt = 0, shadow = true }: StackedCardProps<T>) {
    const isTop = index === selectedIndex;
    const isDismissed = index > selectedIndex;
    const isBase = index === 0;

    const animateNew = typeof tilt === "object" ? (tilt.animateNew ?? true) : true;
    const hasRevealed = useRef(!isDismissed);
    useEffect(() => {
        if (!isDismissed) {
            hasRevealed.current = true;
        }
    }, [isDismissed]);
    // A card dismissed since mount has never been on show, so there is nothing to throw - it only fades
    const fadeOnly = !animateNew && isDismissed && !hasRevealed.current;

    const cardTilt = useMemo(() => {
        if (typeof tilt === "number") {
            return tilt;
        }
        const amount = tilt.amount ?? 0;
        const variance = tilt.variance ? (Math.random() * 2 - 1) * tilt.variance : 0;
        const alternate = !tilt.alternate || index % 2 !== 0 ? 1 : -1;

        return (amount + variance) * alternate;
    }, [index, tilt]);

    const depth = useMemo(
        () => (typeof tilt === "object" && tilt?.depth ? (selectedIndex - index) * -tilt.depth : 1),
        [index, selectedIndex, tilt]
    );

    // The two poses a card is ever in, so a move between them reads the same whichever way it is travelled
    const settled: TargetAndTransition = {
        x: isTop ? 0 : `${-depth / 4}rem`,
        rotate: isTop ? 0 : cardTilt * depth,
        opacity: 1,
        filter: shadow && !isTop ? "brightness(0.5)" : "brightness(1)"
    };
    const thrown: TargetAndTransition = fadeOnly
        ? { x: 0, rotate: 0, opacity: 0, filter: "brightness(1)" }
        : { x: "150%", rotate: 10, opacity: 0, filter: "brightness(1)" };

    // Where the card actually is when thrown, remembered rather than recomputed - by the time a card is
    // dismissed the selection has moved on, so `settled` now describes a different pose than the drawn one.
    const settledRef = useRef(settled);
    if (!isDismissed) {
        settledRef.current = settled;
    }

    // The throw travels well outside the stack, so something would clip it mid-flight - the card in
    // transit is drawn again on document.body, from its actual position, and dropped once it lands.
    const nodeRef = useRef<HTMLDivElement>(null);
    const [flight, setFlight] = useState<Flight>();
    const wasDismissed = useRef(isDismissed);
    useLayoutEffect(() => {
        if (isDismissed === wasDismissed.current) {
            return;
        }
        wasDismissed.current = isDismissed;

        // Measured from the stack, not the card: a transformed card's rect wouldn't describe home. The
        // stack fills the same box as every card and never moves, so it answers for both directions.
        const rect = nodeRef.current?.parentElement?.getBoundingClientRect();
        if (rect && !fadeOnly) {
            setFlight({ rect, isLeaving: isDismissed });
        }
    }, [isDismissed, fadeOnly]);

    return (
        <>
            <motion.div
                ref={nodeRef}
                initial={false}
                animate={isDismissed ? thrown : settled}
                transition={flight ? INSTANT : STACK_TRANSITION}
                className={classNames("size-full", {
                    "absolute inset-0": !isBase,
                    invisible: !!flight
                })}
            >
                {renderCard(card, index)}
            </motion.div>
            {flight &&
                createPortal(
                    <FlightCard
                        flight={flight}
                        from={flight.isLeaving ? settledRef.current : thrown}
                        to={flight.isLeaving ? thrown : settled}
                        onLanded={() => setFlight(undefined)}
                    >
                        {renderCard(card, index)}
                    </FlightCard>,
                    document.body
                )}
        </>
    );
}

/**
 * The card in transit, drawn on document.body so nothing above the stack can clip it. It waits a frame
 * before moving, since mounting a second heavy copy would otherwise eat the animation's first frames.
 */
function FlightCard({ flight, from, to, onLanded, children }: FlightCardProps) {
    const [isMoving, setIsMoving] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setIsMoving(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <motion.div
            className="pointer-events-none fixed z-50"
            style={{
                top: flight.rect.top,
                left: flight.rect.left,
                width: flight.rect.width,
                height: flight.rect.height
            }}
            initial={from}
            animate={isMoving ? to : from}
            transition={STACK_TRANSITION}
            onAnimationComplete={() => isMoving && onLanded()}
        >
            {children}
        </motion.div>
    );
}

type FlightCardProps = {
    flight: Flight;
    from: TargetAndTransition;
    to: TargetAndTransition;
    onLanded: () => void;
    children: React.ReactNode;
};

type Flight = {
    /** The stack's own box - the place a card leaves from and the place it returns to */
    rect: DOMRect;
    isLeaving: boolean;
};

type StackedCardProps<T> = {
    card: T;
    renderCard: (card: T, index: number) => React.ReactNode;
    selectedIndex: number;
    index: number;
    tilt?: TiltOptions;
    shadow?: boolean;
};

type TiltOptions =
    | number
    | {
          amount?: number;
          variance?: number;
          alternate?: boolean;
          depth?: number;
          animateNew?: boolean;
      };
