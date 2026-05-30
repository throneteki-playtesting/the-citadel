import { useMemo } from "react";
import classNames from "classnames";

export default function CardStack<T>({
    cards,
    children: renderCard,
    selectedIndex = 0,
    tilt,
    className,
    ...props
}: CardStackProps<T>) {
    return (
        <div className={classNames("relative", className)} {...props}>
            {
                cards.map((card, index) =>
                    <StackedCard
                        key={index}
                        card={card}
                        renderCard={renderCard}
                        selectedIndex={selectedIndex}
                        index={index}
                        tilt={tilt}
                    />
                )
            }
        </div>
    );
}

type CardStackProps<T> = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
    cards: T[];
    children: (card: T) => React.ReactNode;
    selectedIndex?: number;
    tilt?: TiltOptions;
};

function StackedCard<T>({ card, renderCard, selectedIndex, index, tilt = 0 }: StackedCardProps<T>) {
    const isTop = index === selectedIndex;
    const isDismissed = index > selectedIndex;
    const isBase = index === 0;
    const depth = selectedIndex - index;

    const cardTilt = useMemo(() => {
        if (typeof tilt === "number") {
            return tilt;
        }
        const amount = tilt.amount;
        if (amount === 0) {
            return amount;
        }
        const variance = tilt.variance ? (Math.random() * 2 - 1) * tilt.variance : 0;
        const alternate = !tilt.alternate || index % 2 !== 0 ? 1 : -1;

        return (amount + variance) * alternate * depth;
    }, [depth, index, tilt]);

    return (
        <div
            key={index}
            className={classNames(
                "size-full transition-all duration-400 ease-in-out",
                {
                    "absolute inset-0": !isBase,
                    "translate-x-[150%] rotate-10 opacity-0": isDismissed && !isBase,
                    "brightness-50 -translate-x-2 overflow-hidden": !isDismissed && !isTop
                }
            )}
            style={!isDismissed && !isTop ? { rotate: `${cardTilt}deg` } : undefined}
        >
            {renderCard(card)}
        </div>
    );
}

type StackedCardProps<T> = {
    card: T;
    renderCard: (card: T) => React.ReactNode;
    selectedIndex: number;
    index: number;
    tilt?: TiltOptions;
}

type TiltOptions = number | { amount: number, variance?: number, alternate?: boolean };