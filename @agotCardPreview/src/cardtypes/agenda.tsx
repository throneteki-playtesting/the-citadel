import {
    Ability,
    Card,
    DeckLimit,
    Designer,
    Name,
    TextBox,
    Traits,
    Type,
    Watermark
} from "../components/cardComponents";
import AutoSize from "../components/autoSize";
import { CardComponentProps } from "../types";
import { memo } from "react";

const Agenda = memo(({ card, scale, orientation, rounded, className, style, ...props }: CardComponentProps) => {
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
            <div>
                <Name>{card.name}</Name>
                <Type style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>Agenda</Type>
            </div>
            <div style={{ flexGrow: 1, position: "relative", display: "flex" }}>
                <DeckLimit type={card.type} style={{ position: "absolute", height: "100%" }}>
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
        </Card>
    );
});

export default Agenda;
