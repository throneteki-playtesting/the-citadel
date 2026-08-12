import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImage, faLinkSlash } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import classNames from "classnames";
import { displayableUrls, driveFileId } from "common/models/artwork";
import { BaseElementProps } from "../../types";
import ArtworkFocus from "./artworkFocus";

const ratioClasses = {
    landscape: "aspect-[4/3]",
    portrait: "aspect-[240/333]",
    square: "aspect-square"
} as const;

/**
 * Artwork shown straight from wherever it is hosted. Nothing is stored on our side, so a link which has
 * since been taken down is a real outcome rather than an error - it gets its own state, since the artwork
 * is then only recoverable from whoever saved it into the art folders.
 *
 * The frame is a fixed shape but the piece inside it is never cropped to fill it. Artwork arrives in every
 * ratio going, and a crop here would hide exactly the part someone is trying to judge.
 */
export default function ArtworkImage({ className, style, url, alt, ratio = "landscape" }: ArtworkImageProps) {
    // A Drive share link points at a viewer page, so it is rewritten - and Drive's two hosts fail
    // independently, so a failure moves to the next candidate before giving up
    const candidates = displayableUrls(url);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<LoadState>(url ? "loading" : "empty");
    const [origin, setOrigin] = useState<DOMRect>();
    const imageRef = useRef<HTMLImageElement | null>(null);
    const isDrive = !!url && !!driveFileId(url);

    // A new url is a fresh attempt, including one which failed a moment ago
    useEffect(() => {
        setAttempt(0);
        setState(url ? "loading" : "empty");
    }, [url]);

    /**
     * Reordering a list moves the <img> rather than remounting it, and a browser can hand back an element
     * which is already complete without firing load again - the skeleton would then sit over a picture that
     * is right there. The element itself is the only answer that survives the move
     */
    const onAttach = (img: HTMLImageElement | null) => {
        imageRef.current = img;
        if (img?.complete && img.naturalWidth > 0) {
            setState("loaded");
        }
    };

    const onError = () => {
        if (attempt + 1 < candidates.length) {
            setAttempt(attempt + 1);
            return;
        }
        setState("failed");
    };

    const frameClasses = classNames(
        "relative w-full overflow-hidden rounded-md bg-content2",
        ratioClasses[ratio],
        className
    );

    if (state === "empty" || state === "failed") {
        // A Drive file which won't load is nearly always shared too narrowly rather than gone
        const failureDetail = isDrive
            ? "Check the Drive file is shared with anyone who has the link"
            : "The link may have been taken down";

        return (
            <div className={frameClasses} style={style}>
                <Placeholder
                    icon={state === "failed" ? faLinkSlash : faImage}
                    label={state === "failed" ? "Image unavailable" : "No image yet"}
                    detail={state === "failed" ? failureDetail : undefined}
                />
            </div>
        );
    }

    const canFocus = state === "loaded";
    const focus = () => setOrigin(imageRef.current?.getBoundingClientRect());

    return (
        <>
            <motion.div
                className={classNames(frameClasses, canFocus && "cursor-zoom-in")}
                style={style}
                whileHover={canFocus ? { scale: 0.97 } : undefined}
                whileTap={canFocus ? { scale: 0.94 } : undefined}
                transition={{ duration: 0.15, ease: "easeOut" }}
                role={canFocus ? "button" : undefined}
                tabIndex={canFocus ? 0 : undefined}
                aria-label={canFocus ? `View ${alt} up close` : undefined}
                onClick={canFocus ? focus : undefined}
                onKeyDown={(event: React.KeyboardEvent) => {
                    if (canFocus && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        focus();
                    }
                }}
            >
                {state === "loading" && <Skeleton className="absolute inset-0" />}
                <img
                    key={candidates[attempt]}
                    ref={onAttach}
                    src={candidates[attempt]}
                    alt={alt}
                    className={classNames(
                        "absolute inset-0 size-full object-contain transition-opacity duration-200",
                        state === "loading" ? "opacity-0" : "opacity-100"
                    )}
                    onLoad={() => setState("loaded")}
                    onError={onError}
                />
            </motion.div>

            <ArtworkFocus
                origin={origin}
                src={candidates[attempt]}
                alt={alt}
                url={url}
                onClose={() => setOrigin(undefined)}
            />
        </>
    );
}

type LoadState = "empty" | "loading" | "loaded" | "failed";

type ArtworkImageProps = Omit<BaseElementProps, "children"> & {
    url?: string;
    alt: string;
    /** Sourced options preview wide; a finished piece gets as square a canvas as the layout allows */
    ratio?: keyof typeof ratioClasses;
};

function Placeholder({ icon, label, detail }: PlaceholderProps) {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-foreground/40">
            <FontAwesomeIcon icon={icon} className="text-2xl" />
            <span className="text-xs">{label}</span>
            {detail && <span className="text-[0.65rem] text-foreground/30">{detail}</span>}
        </div>
    );
}

type PlaceholderProps = {
    icon: IconDefinition;
    label: string;
    detail?: string;
};
