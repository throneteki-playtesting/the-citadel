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

const Attachment = memo(({ card, scale, orientation, rounded, className, style, ...props }: CardComponentProps) => {
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
                    <Type>Attachment</Type>
                    <DeckLimit type={card.type} style={{ flexGrow: 1 }}>
                        {card.deckLimit}
                    </DeckLimit>
                </div>
                <Watermark style={{ marginRight: px(35) }}>{card.watermark}</Watermark>
            </div>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <TextBox style={{ width: "100%", paddingBottom: px(10) }}>
                    <Traits>{card.traits}</Traits>
                    <AutoSize height={90} style={{ display: "flex", flexDirection: "column" }}>
                        <Ability>{card.text}</Ability>
                        <Designer>{card.designer}</Designer>
                    </AutoSize>
                </TextBox>
                <Loyalty style={{ position: "absolute", bottom: px(0) }}>{card.loyal}</Loyalty>
            </div>
            <div style={{ display: "flex" }}>
                <Name
                    unique={card.unique}
                    style={{
                        flexGrow: 1,
                        borderTopWidth: px(2),
                        borderBottomWidth: px(2),
                        borderLeftWidth: px(2)
                    }}
                >
                    {card.name}
                </Name>
                <Faction>{card.faction}</Faction>
            </div>
        </Card>
    );
});

export default Attachment;
