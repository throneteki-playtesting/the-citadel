import {
    Ability,
    Card,
    Cost,
    DeckLimit,
    Designer,
    Faction,
    Loyalty,
    Name,
    TextBox,
    Traits,
    Type,
    Watermark
} from "../components/cardComponents";
import AutoSize from "../components/autoSize";
import { CardComponentProps } from "../types";
import { px } from "../utils";
import { memo } from "react";

const Location = memo(({ card, scale, orientation, rounded, className, style, ...props }: CardComponentProps) => {
    return (
        <Card
            scale={scale}
            card={card}
            orientation={orientation}
            rounded={rounded}
            className={className}
            styles={{ inner: { display: "flex", flexDirection: "row" } }}
            style={style}
            {...props}
        >
            <div style={{ position: "relative", display: "flex", flexDirection: "column", width: px(35) }}>
                <Cost>{card.cost}</Cost>
                <Type>Location</Type>
                <Name
                    unique={card.unique}
                    height={150}
                    style={{
                        width: px(35),
                        borderBottomWidth: px(2),
                        borderLeftWidth: px(2),
                        borderRightWidth: px(2),
                        borderStyle: "solid",
                        borderColor: "black",
                        rotate: "180deg",
                        paddingTop: px(5),
                        paddingBottom: px(5),
                        writingMode: "vertical-rl"
                    }}
                >
                    {card.name}
                </Name>
                <Faction>{card.faction}</Faction>
                <Loyalty>{card.loyal}</Loyalty>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "space-between" }}>
                <div style={{ position: "relative", display: "flex", flexDirection: "column", flexGrow: 1 }}>
                    <DeckLimit
                        type={card.type}
                        style={{ position: "absolute", alignSelf: "self-end", height: "100%" }}
                        alignment="right"
                    >
                        {card.deckLimit}
                    </DeckLimit>
                    <Watermark>{card.watermark}</Watermark>
                </div>
                <TextBox>
                    <Traits>{card.traits}</Traits>
                    <AutoSize height={130} style={{ display: "flex", flexDirection: "column" }}>
                        <Ability>{card.text}</Ability>
                        <Designer>{card.designer}</Designer>
                    </AutoSize>
                </TextBox>
            </div>
        </Card>
    );
});

export default Location;
