import { Code, Faction, IPlaytestCard } from "common/models/cards";
import { useLazyGetTDBCardQuery } from "../api/thronesdb";
import { Alert, Skeleton } from "@heroui/react";
import { getFactionCardImage } from "../utils";
import { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { isFaction } from "common/utils";
import { BaseElementProps } from "../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import { TouchTooltip } from "./touchTooltip";
import TooltipDetail from "./tooltipDetail";

const CardImage = ({ className, style, card: identifier, orientation }: CardImageProps) => {
    const [isError, setIsError] = useState(false);
    const [fetchCard] = useLazyGetTDBCardQuery();

    const [imageUrl, setImageUrl] = useState<string>();
    const [loadedUrl, setLoadedUrl] = useState<string>();
    const [defaultOrientation, setDefaultOrientation] = useState<"vertical" | "horizontal" | undefined>(
        typeof identifier !== "string" ? (identifier.type === "plot" ? "horizontal" : "vertical") : undefined
    );
    const [alt, setAlt] = useState<string>();

    const actualOrientation = useMemo(
        () => orientation ?? defaultOrientation ?? "vertical",
        [defaultOrientation, orientation]
    );
    const rotate = useMemo(() => actualOrientation !== defaultOrientation, [actualOrientation, defaultOrientation]);

    useEffect(() => {
        const fetchCardAsync = async (code: Code) => {
            const fetched = await fetchCard(code).unwrap();
            setImageUrl(fetched.imageUrl);
            setDefaultOrientation(fetched.type === "plot" ? "horizontal" : "vertical");
            setAlt(fetched.name);
        };
        setIsError(false);
        if (typeof identifier === "string") {
            if (isFaction(identifier)) {
                // If faction code is provided, simply generate faction image url
                const factionImageUrl = getFactionCardImage(identifier);
                setImageUrl(factionImageUrl);
                setDefaultOrientation("vertical");
                setAlt(identifier);
            } else {
                // Otherwise, card code needs to be used to fetch actual card data from ThronesDB
                fetchCardAsync(identifier).catch(() => {
                    console.error(`Failed to fetch card data for ${identifier}`);
                    setIsError(true);
                });
            }
        } else if (identifier._metadata?.imageUrl) {
            // If a playtesting card is provided, it MUST have a synced imageUrl to grab an actual image
            setImageUrl(identifier._metadata.imageUrl);
            setDefaultOrientation(identifier.type === "plot" ? "horizontal" : "vertical");
            setAlt(identifier.name);
        } else {
            console.error(`Image URL data is missing for ${identifier?.name ?? identifier ?? "Unknown Card"}`);
            setIsError(true);
        }
    }, [fetchCard, identifier]);

    // Stays loading until the image itself has finished decoding, rather than just until its url is known
    const isLoading = !isError && (!imageUrl || loadedUrl !== imageUrl);
    const showImage = !isLoading && !isError;

    return (
        <div
            className={classNames(
                "relative w-full [container-type:size] flex items-center justify-center overflow-hidden",
                actualOrientation === "horizontal" ? "aspect-[333/240]" : "aspect-[240/333]",
                className
            )}
            style={style}
        >
            {isLoading && <Skeleton className="absolute inset-0 z-10 block w-full h-full" />}
            {isError && (
                <Alert
                    color="danger"
                    variant="faded"
                    hideIcon
                    className="absolute inset-0 z-10 flex w-full h-full p-0 rounded-[inherit]"
                >
                    <TouchTooltip
                        content={
                            <TooltipDetail heading={alt ?? "Unknown card"}>
                                This card's image could not be loaded.
                            </TooltipDetail>
                        }
                        size="sm"
                        delay={0}
                    >
                        <div className="pointer-events-auto w-full h-full flex flex-col items-center justify-center gap-[3cqh] px-[6cqw] text-center text-danger">
                            <FontAwesomeIcon
                                icon={faCircleExclamation}
                                className="text-[clamp(0.75rem,15cqw,2.5rem)] opacity-70"
                            />
                            <div className="font-cinzel uppercase tracking-wide leading-tight text-[clamp(0.5rem,7cqw,1.125rem)]">
                                Image unavailable
                            </div>
                            {alt && (
                                <div className="font-sans leading-tight line-clamp-2 text-danger/70 text-[clamp(0.45rem,5cqw,0.875rem)]">
                                    {alt}
                                </div>
                            )}
                        </div>
                    </TouchTooltip>
                </Alert>
            )}
            <img
                src={imageUrl}
                decoding="async"
                onLoad={() => setLoadedUrl(imageUrl)}
                onError={() => setIsError(true)}
                className={classNames("object-contain transition-opacity duration-500", {
                    "opacity-0": !showImage,
                    "-rotate-90 w-[100cqh] h-[100cqw] min-w-[100cqh] min-h-[100cqw]": rotate,
                    "w-full h-full": !rotate
                })}
                alt={alt}
            />
        </div>
    );
};

type CardImageProps = Omit<BaseElementProps, "children"> & {
    card: Code | Faction | IPlaytestCard;
    orientation?: "vertical" | "horizontal";
};

export default CardImage;
