import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, TargetAndTransition, Transition } from "framer-motion";
import classNames from "classnames";
import { EASE_STANDARD } from "../constants";
import { useReducedMotion } from "../hooks/useReducedMotion";

const STACK_TRANSITION: Transition = { duration: 0.4, ease: EASE_STANDARD };
const SHUFFLE_TRANSITION: Transition = { duration: 0.25, ease: EASE_STANDARD };
const INSTANT: Transition = { duration: 0 };

// Just clear of the pile, so the crop switching at the turn never cuts through the card
function shuffledPose(direction: ShuffleDirection): TargetAndTransition {
    return { x: `${112 * direction}%`, rotate: 6 * direction, opacity: 1, filter: "brightness(1)" };
}

function clippingAncestors(element: HTMLElement): ClippingAncestor[] {
    const ancestors: ClippingAncestor[] = [];
    for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(current);
        if (overflowX !== "visible" || overflowY !== "visible") {
            ancestors.push({ element: current, clipsX: overflowX !== "visible", clipsY: overflowY !== "visible" });
        }
    }
    return ancestors;
}

// The part of the viewport every clipping ancestor leaves visible
function visibleBox(ancestors: ClippingAncestor[]): Box {
    const box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    for (const { element, clipsX, clipsY } of ancestors) {
        const rect = element.getBoundingClientRect();
        if (clipsX) {
            box.left = Math.max(box.left, rect.left);
            box.right = Math.min(box.right, rect.right);
        }
        if (clipsY) {
            box.top = Math.max(box.top, rect.top);
            box.bottom = Math.min(box.bottom, rect.bottom);
        }
    }
    return box;
}

function insetClipPath(box: Box, width: number, height: number) {
    const insets = [box.top, width - box.right, height - box.bottom, box.left];
    return `inset(${insets.map((inset) => `${Math.max(0, inset)}px`).join(" ")})`;
}

function boxStyle(rect: DOMRect) {
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

// Holds a portalled copy still for its first frame, since mounting it would otherwise eat the animation's start
function useHasFirstFrame() {
    const [hasFirstFrame, setHasFirstFrame] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setHasFirstFrame(true));
        return () => cancelAnimationFrame(frame);
    }, []);
    return hasFirstFrame;
}

export default function CardStack<T>({
    cards,
    children: renderCard,
    selectedIndex = cards.length - 1,
    behaviour = "throw",
    tilt,
    shadow,
    className,
    ...props
}: CardStackProps<T>) {
    return (
        <div className={classNames("relative", className)} {...props}>
            {cards.map((card, index) =>
                behaviour === "stacked" ? (
                    <ShuffledCard
                        key={index}
                        card={card}
                        renderCard={renderCard}
                        selectedIndex={selectedIndex}
                        index={index}
                        count={cards.length}
                        tilt={tilt}
                        shadow={shadow}
                    />
                ) : (
                    <ThrownCard
                        key={index}
                        card={card}
                        renderCard={renderCard}
                        selectedIndex={selectedIndex}
                        index={index}
                        tilt={tilt}
                        shadow={shadow}
                    />
                )
            )}
        </div>
    );
}

type CardStackProps<T> = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
    cards: T[];
    children: (card: T, index: number) => React.ReactNode;
    selectedIndex?: number;
    /** "throw" dismisses cards above the selection; "stacked" shuffles the top card under the pile */
    behaviour?: "throw" | "stacked";
    tilt?: TiltOptions;
    shadow?: boolean;
};

function useCardTilt(tilt: TiltOptions, index: number) {
    return useMemo(() => {
        if (typeof tilt === "number") {
            return tilt;
        }
        const amount = tilt.amount ?? 0;
        const variance = tilt.variance ? (Math.random() * 2 - 1) * tilt.variance : 0;
        const alternate = !tilt.alternate || index % 2 !== 0 ? 1 : -1;

        return (amount + variance) * alternate;
    }, [index, tilt]);
}

/** Where a card rests at a given depth into the pile, 0 being the top */
function settledPose(position: number, cardTilt: number, tilt: TiltOptions, shadow: boolean): TargetAndTransition {
    const isTop = position === 0;
    const depth = typeof tilt === "object" && tilt?.depth ? position * -tilt.depth : 1;
    return {
        x: isTop ? 0 : `${-depth / 4}rem`,
        rotate: isTop ? 0 : cardTilt * depth,
        opacity: 1,
        filter: shadow && !isTop ? "brightness(0.5)" : "brightness(1)"
    };
}

// Keyed by its place in `cards`; its place in the pile is derived from the selection, so cycling never remounts
function ShuffledCard<T>({
    card,
    renderCard,
    selectedIndex,
    index,
    count,
    tilt = 0,
    shadow = true
}: ShuffledCardProps<T>) {
    const position = (((selectedIndex - index) % count) + count) % count;
    const isBase = index === 0;
    const cardTilt = useCardTilt(tilt, index);
    const settled = settledPose(position, cardTilt, tilt, shadow);

    const prefersReducedMotion = useReducedMotion();
    const nodeRef = useRef<HTMLDivElement>(null);
    const [shuffle, setShuffle] = useState<Shuffle>();
    const settledRef = useRef(settled);
    settledRef.current = settled;
    const previous = useRef({ position, count, pose: settled });

    useLayoutEffect(() => {
        const { position: from, pose: fromPose } = previous.current;
        const isCycle = count === previous.current.count;
        previous.current = { position, count, pose: settledRef.current };

        // Only a card crossing the others travels out and back; the rest just shift a place
        const isTucking = count > 1 && from === 0 && position === count - 1;
        const isDrawing = position === 0 && from > 1;
        if (prefersReducedMotion || !isCycle || (!isTucking && !isDrawing)) {
            return;
        }

        const node = nodeRef.current;
        const pile = node?.parentElement;
        if (node && pile) {
            const rect = pile.getBoundingClientRect();
            const clips = clippingAncestors(pile);
            const box = visibleBox(clips);
            const direction = box.right - rect.right >= rect.left - box.left ? 1 : -1;
            // A card already in the air keeps flying; its destination and crop follow the selection live
            setShuffle(
                (current) =>
                    current ?? { pile, rect, clips, direction, from: fromPose, isFromTop: from === 0, snapshot: node }
            );
        }
    }, [position, count, prefersReducedMotion]);

    return (
        <>
            <motion.div
                ref={nodeRef}
                initial={false}
                animate={settled}
                transition={shuffle || prefersReducedMotion ? INSTANT : STACK_TRANSITION}
                style={{ zIndex: count - position }}
                className={classNames("size-full", isBase ? "relative" : "absolute inset-0", {
                    invisible: !!shuffle
                })}
            >
                {renderCard(card, index)}
            </motion.div>
            {shuffle &&
                createPortal(
                    <ShuffleFlight
                        shuffle={shuffle}
                        to={settled}
                        isLandingOnTop={position === 0}
                        onLanded={() => setShuffle(undefined)}
                    />,
                    document.body
                )}
        </>
    );
}

// Drawn above everything, so the leg passing under the pile is cropped at the pile's edge instead
function ShuffleFlight({ shuffle, to, isLandingOnTop, onLanded }: ShuffleFlightProps) {
    const isMoving = useHasFirstFrame();
    const [leg, setLeg] = useState<"out" | "back">("out");
    const frameRef = useRef<HTMLDivElement>(null);
    const followRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const isUnderPile = leg === "back" ? !isLandingOnTop : !shuffle.isFromTop;
    const isUnderPileRef = useRef(isUnderPile);
    isUnderPileRef.current = isUnderPile;

    useLayoutEffect(() => {
        const content = contentRef.current;
        if (!content) {
            return;
        }
        // A DOM copy, not a second render - a second live draggable would unregister the real one on landing
        content.replaceChildren(...Array.from(shuffle.snapshot.childNodes, (child) => child.cloneNode(true)));
    }, [shuffle.snapshot]);

    // Tracks the pile each frame, so scrolling carries the card along and it is hidden wherever the pile is
    useLayoutEffect(() => {
        let frame = 0;
        const follow = () => {
            const frameElement = frameRef.current;
            const followElement = followRef.current;
            if (frameElement && followElement) {
                const pile = shuffle.pile.getBoundingClientRect();
                const dx = pile.left - shuffle.rect.left;
                const dy = pile.top - shuffle.rect.top;
                followElement.style.transform = `translate(${dx}px, ${dy}px)`;

                const box = visibleBox(shuffle.clips);
                if (isUnderPileRef.current && shuffle.direction > 0) {
                    box.left = Math.max(box.left, pile.right);
                } else if (isUnderPileRef.current) {
                    box.right = Math.min(box.right, pile.left);
                }
                frameElement.style.clipPath = insetClipPath(box, frameElement.clientWidth, frameElement.clientHeight);
            }
            frame = requestAnimationFrame(follow);
        };
        follow();
        return () => cancelAnimationFrame(frame);
    }, [shuffle]);

    return (
        <div ref={frameRef} className="pointer-events-none fixed inset-0 z-50">
            <div ref={followRef} className="absolute inset-0">
                <motion.div
                    ref={contentRef}
                    className="absolute"
                    style={boxStyle(shuffle.rect)}
                    initial={shuffle.from}
                    animate={!isMoving ? shuffle.from : leg === "out" ? shuffledPose(shuffle.direction) : to}
                    transition={SHUFFLE_TRANSITION}
                    onAnimationComplete={() => {
                        if (!isMoving) {
                            return;
                        }
                        if (leg === "out") {
                            setLeg("back");
                        } else {
                            onLanded();
                        }
                    }}
                />
            </div>
        </div>
    );
}

type ShuffleFlightProps = {
    shuffle: Shuffle;
    to: TargetAndTransition;
    isLandingOnTop: boolean;
    onLanded: () => void;
};

type ShuffleDirection = 1 | -1;

type Box = { left: number; top: number; right: number; bottom: number };

type ClippingAncestor = { element: HTMLElement; clipsX: boolean; clipsY: boolean };

type Shuffle = {
    pile: HTMLElement;
    rect: DOMRect;
    clips: ClippingAncestor[];
    direction: ShuffleDirection;
    from: TargetAndTransition;
    isFromTop: boolean;
    snapshot: HTMLElement;
};

type ShuffledCardProps<T> = {
    card: T;
    renderCard: (card: T, index: number) => React.ReactNode;
    selectedIndex: number;
    index: number;
    count: number;
    tilt?: TiltOptions;
    shadow?: boolean;
};

/**
 * One card of the stack. Every card holds the same place and is posed rather than moved between two
 * poses - stacked or thrown - which is what makes the throw run backwards for free on reversal.
 */
function ThrownCard<T>({ card, renderCard, selectedIndex, index, tilt = 0, shadow = true }: ThrownCardProps<T>) {
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

    const cardTilt = useCardTilt(tilt, index);

    // The two poses a card is ever in, so a move between them reads the same whichever way it is travelled
    const settled = settledPose(selectedIndex - index, cardTilt, tilt, shadow);
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

// The card in transit, drawn on document.body so nothing above the stack can clip it
function FlightCard({ flight, from, to, onLanded, children }: FlightCardProps) {
    const isMoving = useHasFirstFrame();

    return (
        <motion.div
            className="pointer-events-none fixed z-50"
            style={boxStyle(flight.rect)}
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

type ThrownCardProps<T> = {
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
