import { ChallengeIcon } from "common/models/cards";
import {
    Ability,
    Card,
    ChallengeIcons,
    Cost,
    DeckLimit,
    Designer,
    Faction,
    Loyalty,
    Name,
    Strength,
    TextBox,
    Traits,
    Type,
    Watermark
} from "../components/cardComponents";
import AutoSize from "../components/autoSize";
import { CardComponentProps } from "../types";
import { px } from "../utils";
import { memo } from "react";

const Character = memo(({ card, scale, orientation, rounded, className, style, ...props }: CardComponentProps) => {
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
                <div style={{ display: "flex", position: "relative", flexDirection: "column", width: px(35) }}>
                    <Cost>{card.cost}</Cost>
                    <Type>Character</Type>
                    <ChallengeIcons>
                        {Object.entries(card.icons || {})
                            .filter(([, value]) => value)
                            .map(([icon]) => icon as ChallengeIcon)}
                    </ChallengeIcons>
                </div>
                <Watermark>{card.watermark}</Watermark>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <DeckLimit type={card.type} style={{ flexGrow: 1 }} alignment="right">
                        {card.deckLimit}
                    </DeckLimit>
                    <Loyalty>{card.loyal}</Loyalty>
                </div>
            </div>
            <div style={{ display: "flex" }}>
                <Strength>{card.strength}</Strength>
                <Name
                    unique={card.unique}
                    style={{
                        alignSelf: "flex-end",
                        flexGrow: 1,
                        borderColor: "black",
                        fontSize: px(14),
                        lineHeight: "1.4",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: px(30),
                        borderTopWidth: px(2),
                        borderBottomWidth: px(2)
                    }}
                >
                    {card.name}
                </Name>
                <Faction>{card.faction}</Faction>
            </div>
            <TextBox>
                <Traits>{card.traits}</Traits>
                <AutoSize height={95} style={{ display: "flex", flexDirection: "column" }}>
                    <Ability>{card.text}</Ability>
                    <Designer>{card.designer}</Designer>
                </AutoSize>
            </TextBox>
        </Card>
    );
});

export default Character;
