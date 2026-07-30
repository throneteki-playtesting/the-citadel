import { useEffect, useMemo, useRef } from "react";
import classNames from "classnames";

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

    return (
        <div
            key={index}
            className={classNames("size-full transition-all duration-400 ease-in-out", {
                "absolute inset-0": !isBase,
                "translate-x-[150%] rotate-10 opacity-0": isDismissed && !isBase && !fadeOnly,
                "brightness-50": shadow && !isDismissed && !isTop
            })}
            style={
                !isDismissed && !isTop
                    ? { rotate: `${cardTilt * depth}deg`, transform: `translateX(${-depth / 4}rem)` }
                    : undefined
            }
        >
            {renderCard(card, index)}
        </div>
    );
}

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
