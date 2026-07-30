import {
    Ability,
    Card,
    DeckLimit,
    Designer,
    Faction,
    Loyalty,
    Name,
    PlotStat,
    TextBox,
    Traits,
    Type,
    Watermark
} from "../components/cardComponents";
import AutoSize from "../components/autoSize";
import { px } from "../utils";
import { CardComponentProps } from "../types";
import { memo } from "react";

const Plot = memo(({ card, scale, orientation, rounded, className, style, ...props }: CardComponentProps) => {
    return (
        <Card
            scale={scale}
            card={card}
            orientation={orientation}
            rounded={rounded}
            className={className}
            style={style}
            {...props}
        >
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", height: px(40) }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: px(4),
                        width: px(110)
                    }}
                >
                    <PlotStat type="income">{card.plotStats?.income}</PlotStat>
                    <PlotStat type="initiative">{card.plotStats?.initiative}</PlotStat>
                    <PlotStat type="claim">{card.plotStats?.claim}</PlotStat>
                </div>
                <Name style={{ display: "flex", flexGrow: 1, fontSize: px(18) }}>{card.name}</Name>
            </div>
            <div style={{ display: "flex", flexGrow: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", width: px(35) }}>
                    <Type>Plot</Type>
                    <DeckLimit type={card.type} style={{ flexGrow: 1 }}>
                        {card.deckLimit}
                    </DeckLimit>
                </div>
                <Watermark>{card.watermark}</Watermark>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        width: px(35),
                        paddingRight: px(5)
                    }}
                >
                    <Faction style={{ borderColor: "transparent" }}>{card.faction}</Faction>
                    <Loyalty>{card.loyal}</Loyalty>
                    <PlotStat type="reserve">{card.plotStats?.reserve}</PlotStat>
                </div>
            </div>
            <TextBox style={{ paddingBottom: px(0) }}>
                <Traits>{card.traits}</Traits>
                <AutoSize height={60} style={{ display: "flex", flexDirection: "column" }}>
                    <Ability>{card.text}</Ability>
                    <Designer>{card.designer}</Designer>
                </AutoSize>
            </TextBox>
        </Card>
    );
});

export default Plot;
