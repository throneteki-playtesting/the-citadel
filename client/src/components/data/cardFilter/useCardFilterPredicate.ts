import { useMemo } from "react";
import { IPlaytestCard } from "common/models/cards";
import { Explodable, Filter, matchesFilter } from "common/types";
import useFilter from "../../../hooks/useFilter";
import { CardFilterValue } from "./types";

export type CardFilterContext = {
    /** Release code isn't a card field - it's only derivable by joining against project slots */
    releaseCodeByCardNumber?: Map<number, string>;
};

export default function useCardFilterPredicate(
    value: CardFilterValue,
    context?: CardFilterContext
): (card: IPlaytestCard) => boolean {
    const { traits, releases, ...explodable } = value;

    const filters = useFilter<IPlaytestCard>(explodable as Explodable<IPlaytestCard>);

    return useMemo(() => {
        return (card: IPlaytestCard) => {
            if (filters && !filters.some((filter: Filter<IPlaytestCard>) => matchesFilter(card, filter))) {
                return false;
            }
            if (traits && traits.length > 0 && !traits.some((trait) => card.traits.includes(trait))) {
                return false;
            }
            if (releases && releases.length > 0) {
                const code = context?.releaseCodeByCardNumber?.get(card.number);
                if (!code || !releases.includes(code)) {
                    return false;
                }
            }
            return true;
        };
    }, [filters, traits, releases, context]);
}
