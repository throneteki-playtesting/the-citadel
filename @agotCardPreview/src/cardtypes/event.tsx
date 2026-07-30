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

const Event = memo(({ card, scale, orientation, rounded, className, style, ...props }: CardComponentProps) => {
    return (
        <Card
            scale={scale}
            card={card}
            orientation={orientation}
            rounded={rounded}
            className={className}
            styles={{ inner: { display: "flex", flexDirection: "column" } }}
            style={style}
            {...props}
        >
            <div style={{ display: "flex", flexGrow: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", width: px(35) }}>
                    <Cost>{card.cost}</Cost>
                    <Type>Event</Type>
                    <DeckLimit type={card.type} style={{ flexGrow: 1 }}>
                        {card.deckLimit}
                    </DeckLimit>
                </div>
                <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
                    <Name
                        style={{
                            borderTopWidth: px(2),
                            borderBottomWidth: px(2),
                            borderLeftWidth: px(2)
                        }}
                    >
                        {card.name}
                    </Name>
                    <Watermark style={{ flexGrow: 1 }}>{card.watermark}</Watermark>
                </div>
                <div style={{ display: "flex", flexDirection: "column", width: px(35) }}>
                    <Faction>{card.faction}</Faction>
                    <Loyalty>{card.loyal}</Loyalty>
                </div>
            </div>
            <TextBox>
                <Traits>{card.traits}</Traits>
                <AutoSize height={130} style={{ display: "flex", flexDirection: "column" }}>
                    <Ability>{card.text}</Ability>
                    <Designer>{card.designer}</Designer>
                </AutoSize>
            </TextBox>
        </Card>
    );
});

export default Event;
