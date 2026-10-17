import { ReactNode, useRef, useState } from "react";
import { motion } from "framer-motion";
import ArtworkFocus from "./artwork/artworkFocus";
import { cardThumbnailWidthRem } from "../utils";
import { VERTICAL_CARD_WIDTH_REM } from "../constants";

// A printed card image's own size, so a card drawn on the page focuses no larger than one loaded would
const CARD_IMAGE_SIZE = { width: 300, height: 419 };
const PLOT_IMAGE_SIZE = { width: 419, height: 300 };

/** One card at (roughly) its real shape, zoomable into ArtworkFocus - either a printed image, or `children`
 *  drawing it on the page where there is none to load. */
export default function CardFocusThumbnail({
    imageUrl,
    alt,
    isPlot,
    url,
    linkLabel,
    widthRem = VERTICAL_CARD_WIDTH_REM,
    children
}: CardFocusThumbnailProps) {
    const [origin, setOrigin] = useState<DOMRect>();
    const pieceRef = useRef<HTMLDivElement & HTMLImageElement>(null);
    const focus = () => setOrigin(pieceRef.current?.getBoundingClientRect());

    return (
        <>
            <motion.div
                className="relative shrink-0 cursor-zoom-in overflow-hidden rounded-md"
                style={{
                    width: `${cardThumbnailWidthRem(isPlot, widthRem)}rem`,
                    aspectRatio: isPlot ? "333/240" : "240/333"
                }}
                whileHover={{ scale: 0.97 }}
                whileTap={{ scale: 0.94 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                role="button"
                tabIndex={0}
                aria-label={`View ${alt} up close`}
                onClick={focus}
                onKeyDown={(event: React.KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        focus();
                    }
                }}
            >
                {children ? (
                    <div ref={pieceRef} className="absolute inset-0">
                        {children}
                    </div>
                ) : (
                    <img
                        ref={pieceRef}
                        src={imageUrl}
                        alt={alt}
                        className="absolute inset-0 size-full object-contain"
                    />
                )}
            </motion.div>
            <ArtworkFocus
                origin={origin}
                src={imageUrl}
                url={url}
                alt={alt}
                linkLabel={linkLabel}
                showSkeleton={false}
                naturalSize={children ? (isPlot ? PLOT_IMAGE_SIZE : CARD_IMAGE_SIZE) : undefined}
                onClose={() => setOrigin(undefined)}
            >
                {children}
            </ArtworkFocus>
        </>
    );
}

type CardFocusThumbnailProps = {
    imageUrl?: string;
    alt: string;
    isPlot: boolean;
    /** Where the focused view's caption links out to */
    url?: string;
    linkLabel?: string;
    /** A vertical card's width - a plot's is derived from it */
    widthRem?: number;
    children?: ReactNode;
};
