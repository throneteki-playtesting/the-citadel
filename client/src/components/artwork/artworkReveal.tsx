import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { artworkUrlIssue } from "common/models/artwork";
import ArtworkImage from "./artworkImage";

const REVEAL_TRANSITION = { duration: 0.35, ease: [0.65, 0, 0.35, 1] } as const;

/**
 * The canvas for artwork which may not exist yet. An empty frame sat above the fields is a promise the
 * record can't keep, so nothing is reserved until there is a link worth drawing - and it opens into the
 * space rather than appearing in it, so the layout shifting is something you watch happen.
 *
 * It waits for a whole link rather than the first keystroke; revealing mid-type would flicker the layout
 * open and shut for every character.
 */
export default function ArtworkReveal({ url, alt, children }: ArtworkRevealProps) {
    const isReady = !!url && !artworkUrlIssue(url);
    const isRevealing = useReveal(isReady);

    return (
        <LayoutGroup>
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <AnimatePresence initial={false}>
                    {isReady && (
                        <motion.div
                            key="canvas"
                            layout={isRevealing}
                            className="w-full sm:w-64 shrink-0 overflow-hidden"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={REVEAL_TRANSITION}
                        >
                            <ArtworkImage url={url} alt={alt} ratio="square" />
                        </motion.div>
                    )}
                </AnimatePresence>
                <motion.div layout={isRevealing} transition={REVEAL_TRANSITION} className="flex-1 min-w-0">
                    {children}
                </motion.div>
            </div>
        </LayoutGroup>
    );
}

/**
 * True only for the length of the canvas opening or closing. `layout` animates every movement framer sees,
 * so left on permanently it also slides the whole row whenever something above it (the checklist) resizes -
 * which is the page reflowing, not the artwork arriving, and should simply land in its new place.
 *
 * It's derived during render rather than in an effect because framer reads `layout` on the render the
 * change happens on; a commit later is a frame too late and the reveal jumps instead.
 */
function useReveal(isReady: boolean) {
    const [isRevealing, setIsRevealing] = useState(false);
    const [lastReady, setLastReady] = useState(isReady);

    if (lastReady !== isReady) {
        setLastReady(isReady);
        setIsRevealing(true);
    }

    useEffect(() => {
        if (!isRevealing) {
            return;
        }
        const timeout = setTimeout(() => setIsRevealing(false), REVEAL_TRANSITION.duration * 1000);
        return () => clearTimeout(timeout);
    }, [isRevealing]);

    return isRevealing;
}

type ArtworkRevealProps = {
    url?: string;
    alt: string;
    /** The fields the canvas takes its room from */
    children: React.ReactNode;
};
