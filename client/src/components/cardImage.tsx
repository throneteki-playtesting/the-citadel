import { Code, Faction, factions, IPlaytestCard } from "common/models/cards";
import { useLazyGetCardQuery } from "../api/thronesdb";
import { Alert, Skeleton } from "@heroui/react";
import { getFactionCardImage } from "../utils";
import { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { generateReleaseImageUrl } from "common/utils";
import { BaseElementProps } from "../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWarning } from "@fortawesome/free-solid-svg-icons";

const CardImage = ({ className, style, card: identifier, orientation }: CardImageProps) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [fetchCard] = useLazyGetCardQuery();

    const [imageUrl, setImageUrl] = useState<string>();
    const [defaultOrientation, setDefaultOrientation] = useState<"vertical" | "horizontal" | undefined>(typeof identifier !== "string" ? (identifier.type === "plot" ? "horizontal" : "vertical") : undefined);
    const [alt, setAlt] = useState<string>();

    const actualOrientation = useMemo(() => orientation ?? defaultOrientation ?? "vertical", [defaultOrientation, orientation]);
    const rotate = useMemo(() => actualOrientation !== defaultOrientation, [actualOrientation, defaultOrientation]);

    const isFaction = (code: Code | Faction): code is Faction =>
        factions.includes(code as Faction);

    useEffect(() => {
        const fetchCardAsync = async (code: Code) => {
            const fetched = await fetchCard(code).unwrap();
            setImageUrl(fetched.imageUrl);
            setDefaultOrientation(fetched.type === "plot" ? "horizontal" : "vertical");
            setAlt(fetched.name);
        };
        if (typeof identifier === "string") {
            if (isFaction(identifier)) {
                // If faction code is provided, simply generate faction image url
                const factionImageUrl = getFactionCardImage(identifier);
                setImageUrl(factionImageUrl);
                setDefaultOrientation("vertical");
                setAlt(identifier);
            } else {
                // Otherwise, card code needs to be used to fetch actual card data from ThronesDB
                fetchCardAsync(identifier);
            }
        } else if (identifier.imageUrl || identifier.release) {
            // If a playtesting card is provided, it MUST have imageUrl or release to grab an actual image
            const cardImageUrl = identifier.imageUrl ?? generateReleaseImageUrl(identifier.release!.short, identifier.release!.number, identifier.name);
            setImageUrl(cardImageUrl);
            setDefaultOrientation(identifier.type === "plot" ? "horizontal" : "vertical");
            setAlt(identifier.name);
        } else {
            console.error(`Failed to load CardImage: ${identifier}`);
        }
    }, [fetchCard, identifier]);

    const showImage = !isLoading && !isError;

    return (
        <div className={classNames("relative w-full [container-type:size] flex items-center justify-center overflow-hidden", actualOrientation === "horizontal" ? "aspect-[333/240]" : "aspect-[240/333]", className)} style={style}>
            {isLoading && (
                <Skeleton className="absolute inset-0 z-10 block w-full h-full" />
            )}
            {isError && (
                <Alert color="danger" hideIcon className="absolute inset-0 z-10 block w-full h-full">
                    <div className="w-full h-full flex flex-col justify-center">
                        <div className="text-medium"><FontAwesomeIcon icon={faWarning}/> Failed to load</div>
                        <div className="text-2xl">{alt}</div>
                    </div>
                </Alert>
            )}
            <img
                src={imageUrl}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                    setIsLoading(false);
                    setIsError(true);
                }}
                className={classNames("object-contain transition-opacity duration-500", { "opacity-0": !showImage, "-rotate-90 w-[100cqh] h-[100cqw] min-w-[100cqh] min-h-[100cqw]": rotate, "w-full h-full": !rotate })}
                alt={alt}
            />
        </div>
    );
};

type CardImageProps = Omit<BaseElementProps, "children"> & { card: Code | Faction | IPlaytestCard, orientation?: "vertical" | "horizontal" }

export default CardImage;