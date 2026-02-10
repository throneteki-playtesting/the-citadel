import { Code, Faction, factions } from "common/models/cards";
import { useLazyGetCardQuery } from "../api/thronesdb";
import { Image, ImageProps } from "@heroui/react";
import { getFactionCardImage } from "../utilities";
import { useEffect } from "react";

const CardImage = ({ code, radius = "sm", ...props }: CardImageProps) => {
    const [fetchCard, { data: card, isLoading }] = useLazyGetCardQuery();
    const isFaction = (code: Code | Faction): code is Faction =>
        factions.includes(code as Faction);

    useEffect(() => {
        const setCard = async (code: Code) => {
            await fetchCard(code).unwrap();
        };
        if (!isFaction(code)) {
            setCard(code);
        }
    }, [code, fetchCard]);

    if (isFaction(code)) {
        return <Image key={code} src={getFactionCardImage(code)} radius={radius} {...props}/>;
    }

    return <Image isLoading={isLoading} src={card?.imageUrl} radius={radius} {...props}/>;
};

type CardImageProps = ImageProps & { code: Code | Faction }

export default CardImage;