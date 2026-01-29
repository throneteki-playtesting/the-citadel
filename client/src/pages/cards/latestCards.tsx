import { IPlaytestCard } from "common/models/cards";
import { DeepPartial, SingleOrArray } from "common/types";
import { BaseElementProps } from "../../types";
import { useGetCardsQuery } from "../../api";
import { renderPlaytestingCard } from "common/utils";
import CardGrid from "../../components/cardGrid";
import { CardPreview } from "@agot/card-preview";

const LatestCards = ({ className, style, filter }: LatestCardsProps) => {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { ...filter, latest: true } });

    return (
        <CardGrid cards={cardsData?.items} className={className} style={style} isLoading={isLoading}>
            {(card) => (
                <CardPreview
                    key={card.code}
                    card={renderPlaytestingCard(card)}
                    orientation="vertical"
                    rounded={true}
                    className={"transition-all"}
                />)}
        </CardGrid>
    );
};

type LatestCardsProps = Omit<BaseElementProps, "children"> & { filter?: SingleOrArray<DeepPartial<IPlaytestCard>> };

export default LatestCards;