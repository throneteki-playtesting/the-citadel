import { ReactNode, useContext, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { ZoomGuardContext } from "../hooks/zoomGuard";
import ArtworkFocus from "./artwork/artworkFocus";

// A printed card image's own size, so a card drawn on the page focuses no larger than one loaded would
const CARD_IMAGE_SIZE = { width: 300, height: 419 };
const PLOT_IMAGE_SIZE = { width: 419, height: 300 };

/** A card which zooms into the same focused view artwork uses when pressed. */
export default function ZoomableCard({
    alt,
    isPlot,
    imageUrl,
    focus,
    overlay,
    className,
    children
}: ZoomableCardProps) {
    const [origin, setOrigin] = useState<DOMRect>();
    const cardRef = useRef<HTMLDivElement>(null);
    const setGuard = useContext(ZoomGuardContext);
    const isOpen = !!origin;

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setGuard(true);
        return () => setGuard(false);
    }, [isOpen, setGuard]);

    return (
        <>
            <div ref={cardRef} className={classNames("relative", className)}>
                {children}
                {overlay}
                <button
                    type="button"
                    aria-label={`View ${alt} up close`}
                    onClick={() => setOrigin(cardRef.current?.getBoundingClientRect())}
                    className="absolute inset-0 z-10 cursor-zoom-in rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
            </div>
            <ArtworkFocus
                origin={origin}
                src={imageUrl}
                alt={alt}
                showSkeleton={false}
                naturalSize={imageUrl ? undefined : isPlot ? PLOT_IMAGE_SIZE : CARD_IMAGE_SIZE}
                onClose={() => setOrigin(undefined)}
            >
                {imageUrl ? undefined : focus}
            </ArtworkFocus>
        </>
    );
}

type ZoomableCardProps = {
    alt: string;
    isPlot: boolean;
    /** A printed image to focus on, where there is one */
    imageUrl?: string;
    /** The card drawn at focus size, where there is no image to load */
    focus: ReactNode;
    /** Drawn over the card, beneath the press target */
    overlay?: ReactNode;
    className?: string;
    children: ReactNode;
};
