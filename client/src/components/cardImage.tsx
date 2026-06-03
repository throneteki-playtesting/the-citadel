import { Code, Faction, IPlaytestCard } from "common/models/cards";
import { useLazyGetTDBCardQuery } from "../api/thronesdb";
import { Alert, Skeleton } from "@heroui/react";
import { getFactionCardImage } from "../utils";
import { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { generateReleaseImageUrl, isFaction } from "common/utils";
import { BaseElementProps } from "../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";

const CardImage = ({ className, style, card: identifier, orientation }: CardImageProps) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [fetchCard] = useLazyGetTDBCardQuery();

    const [imageUrl, setImageUrl] = useState<string>();
    const [defaultOrientation, setDefaultOrientation] = useState<"vertical" | "horizontal" | undefined>(typeof identifier !== "string" ? (identifier.type === "plot" ? "horizontal" : "vertical") : undefined);
    const [alt, setAlt] = useState<string>();

    const actualOrientation = useMemo(() => orientation ?? defaultOrientation ?? "vertical", [defaultOrientation, orientation]);
    const rotate = useMemo(() => actualOrientation !== defaultOrientation, [actualOrientation, defaultOrientation]);

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
                <Alert color="danger" hideIcon className="absolute inset-0 z-10 flex w-full h-full p-0">
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center">
                        <FontAwesomeIcon icon={faCircleExclamation} className="text-3xl opacity-80" />
                        <div className="text-sm font-semibold uppercase tracking-widest opacity-70">Failed to load image</div>
                        <div className="text-xl font-cinzel">{alt}</div>
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