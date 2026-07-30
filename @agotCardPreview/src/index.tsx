import Character from "./cardtypes/character";
import Location from "./cardtypes/location";
import Attachment from "./cardtypes/attachment";
import Event from "./cardtypes/event";
import Plot from "./cardtypes/plot";
import Agenda from "./cardtypes/agenda";
import { Card, CardWrapper } from "./components/cardComponents";
import { memo, useMemo } from "react";
import { CardComponentProps } from "./types";

export const CardPreview = memo(
    ({ card, scale, orientation, rounded, className, style, ...props }: CardComponentProps) => {
        const CardComponent = useMemo(() => {
            switch (card.type) {
                case "character":
                    return Character;
                case "location":
                    return Location;
                case "attachment":
                    return Attachment;
                case "event":
                    return Event;
                case "plot":
                    return Plot;
                case "agenda":
                    return Agenda;
                default:
                    return Card;
            }
        }, [card.type]);

        return (
            <CardComponent
                card={card}
                scale={scale}
                orientation={orientation}
                rounded={rounded}
                className={className}
                style={style}
                {...props}
            />
        );
    }
);

export const CardBlank = CardWrapper;
