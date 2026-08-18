import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Image, Link, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLinkSlash, faUpRightFromSquare, faXmark } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { displayableUrls } from "common/models/artwork";

const BACKDROP_TRANSITION = { duration: 0.2, ease: "easeOut" } as const;
const PIECE_TRANSITION = { duration: 0.28, ease: [0.32, 0.72, 0, 1] } as const;

// Breathing room around the piece, and the strip the caption sits in beneath it
const EDGE_PADDING = 24;

// Driven from the trigger's own measured rectangle so there is no clipping ancestor to cut the returning
// piece off. Portalled to the body so a fixed child positions against the viewport, not SlidingPages.
export default function ArtworkFocus({ origin, src, url, alt, onClose }: ArtworkFocusProps) {
    const viewport = useViewport();

    const candidates = src ? [src, ...displayableUrls(url).filter((entry) => entry !== src)] : displayableUrls(url);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");

    useEffect(() => {
        setAttempt(0);
        setState(candidates.length > 0 ? "loading" : "failed");
    }, [src, url, candidates.length]);

    const onError = () => {
        setAttempt((previous) => {
            const next = previous + 1;
            if (next < candidates.length) {
                setState("loading");
                return next;
            }
            setState("failed");
            return previous;
        });
    };

    const focused = {
        top: EDGE_PADDING,
        left: EDGE_PADDING,
        width: Math.max(viewport.width - EDGE_PADDING * 2, 0),
        height: Math.max(viewport.height - EDGE_PADDING * 2 - 44, 0)
    };

    const resting = origin && {
        top: origin.top,
        left: origin.left,
        width: origin.width,
        height: origin.height
    };

    return createPortal(
        <AnimatePresence>
            {origin && resting && (
                <motion.div
                    className="fixed inset-0 z-50 bg-black/80"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={BACKDROP_TRANSITION}
                    onClick={onClose}
                >
                    <motion.div
                        className="fixed pointer-events-none flex items-center justify-center"
                        initial={resting}
                        animate={focused}
                        exit={resting}
                        transition={PIECE_TRANSITION}
                    >
                        {state === "failed" ? (
                            <div className="flex flex-col items-center gap-2 text-white/40">
                                <FontAwesomeIcon icon={faLinkSlash} className="text-3xl" />
                                <span className="text-sm">Image unavailable</span>
                            </div>
                        ) : (
                            <>
                                {state === "loading" && <Skeleton className="absolute inset-0 rounded-none" />}
                                <Image
                                    removeWrapper
                                    src={candidates[attempt]}
                                    alt={alt}
                                    className={classNames(
                                        "max-w-full max-h-full pointer-events-auto transition-opacity duration-200",
                                        state === "loading" ? "opacity-0" : "opacity-100"
                                    )}
                                    onLoad={() => setState("loaded")}
                                    onError={onError}
                                    onClick={(event) => event.stopPropagation()}
                                />
                            </>
                        )}
                    </motion.div>
                    <motion.div
                        className="fixed inset-x-0 bottom-0 pointer-events-none flex items-center justify-center gap-3 px-4 h-11 text-sm text-white/70"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={BACKDROP_TRANSITION}
                    >
                        <span className="min-w-0 truncate">{alt}</span>
                        {url && (
                            <Link
                                href={url}
                                isExternal
                                showAnchorIcon
                                anchorIcon={<FontAwesomeIcon icon={faUpRightFromSquare} className="ml-1.5" />}
                                color="foreground"
                                className="shrink-0 pointer-events-auto text-white/70 text-sm data-[hover=true]:text-white"
                                onClick={(event) => event.stopPropagation()}
                            >
                                Open original
                            </Link>
                        )}
                    </motion.div>
                    <Button
                        isIconOnly
                        radius="full"
                        variant="light"
                        aria-label="Close the focused artwork"
                        className="fixed top-3 right-3 text-white/70 data-[hover=true]:text-white data-[hover=true]:bg-white/10"
                        onPress={onClose}
                    >
                        <FontAwesomeIcon icon={faXmark} className="text-xl" />
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}

/** The space the focused piece has to fill, which a rotation or a resize changes underneath it */
function useViewport() {
    const [viewport, setViewport] = useState(() => ({
        width: typeof window === "undefined" ? 0 : window.innerWidth,
        height: typeof window === "undefined" ? 0 : window.innerHeight
    }));

    useEffect(() => {
        const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    return viewport;
}

type ArtworkFocusProps = {
    /** Where the piece is flying from, and the whole of whether it is open */
    origin?: DOMRect;
    /** The host which already loaded for the trigger, tried first so the focused piece draws at once */
    src?: string;
    /** Where the piece really lives, for the caption's way out */
    url?: string;
    alt: string;
    onClose: () => void;
};
