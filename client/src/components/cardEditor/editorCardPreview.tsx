import { ComponentProps, ReactNode, Ref, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import classNames from "classnames";
import { CardPreview } from "@agot/card-preview";
import { EASE_STANDARD, PLOT_RATIO } from "../../constants";
import { QUARTER_TURN } from "../../pages/project/draft/slotShape";

const HANDOFF = { duration: 0.3, ease: EASE_STANDARD } as const;

type Snapshot = { key: string; card: EditorCard; isPlot: boolean; width: number; height: number };
type Handoff = { id: number; from: Snapshot; degrees: number; isDone: boolean };

// The card in an editor, in the space it keeps whichever way it lies. A plot gets the room to be drawn at the size a
// vertical card is, on its side.
export default function EditorCardPreview({
    card,
    isPlot,
    verticalWidth,
    isClamped = true,
    isTurning = false,
    faceRef,
    handoffKey = "",
    className,
    children,
    ref
}: EditorCardPreviewProps) {
    const host = useRef<HTMLDivElement>(null);
    const [available, setAvailable] = useState<number>();

    // Where the editor stacks it above the inputs, a plot can't be wider than the room it has
    useLayoutEffect(() => {
        const parent = host.current?.parentElement;
        if (!parent || !isClamped) {
            return;
        }
        const measure = () => setAvailable(parent.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(parent);
        return () => observer.disconnect();
    }, [isClamped]);

    const width = Math.min(isPlot ? verticalWidth * PLOT_RATIO : verticalWidth, available ?? Infinity);
    const height = isPlot ? width / PLOT_RATIO : width * PLOT_RATIO;

    // What was on show when the handoff key changed lies over the new card and fades off it, turning with it if the
    // card changed between plot and not - any other change to the card is simply swapped in
    const last = useRef<Snapshot>({ key: handoffKey, card, isPlot, width, height });
    const [handoff, setHandoff] = useState<Handoff>();
    // Turning, the card moves within the room it had - nothing around it is to shift while it does
    const settled = useRef({ width, height });
    useLayoutEffect(() => {
        const previous = last.current;
        last.current = { key: handoffKey, card, isPlot, width, height };
        if (!isTurning) {
            settled.current = { width, height };
        }
        if (previous.key !== handoffKey) {
            setHandoff((open) => ({
                id: (open?.id ?? 0) + 1,
                from: previous,
                degrees: previous.isPlot === isPlot ? 0 : isPlot ? -QUARTER_TURN : QUARTER_TURN,
                isDone: false
            }));
        }
    }, [handoffKey, card, isPlot, width, height, isTurning]);

    return (
        <motion.div
            ref={(node) => {
                host.current = node;
                if (typeof ref === "function") {
                    ref(node);
                } else if (ref) {
                    ref.current = node;
                }
            }}
            initial={false}
            animate={isTurning ? settled.current : { width, height }}
            transition={isTurning ? HANDOFF : { duration: 0 }}
            className={classNames("relative shrink-0", className)}
        >
            <motion.div
                key={handoff?.id ?? 0}
                ref={faceRef}
                initial={handoff ? { rotate: handoff.degrees } : false}
                animate={{ rotate: 0 }}
                transition={HANDOFF}
                className="absolute left-0 top-1/2 -translate-y-1/2"
                style={{ width, height }}
            >
                <CardPreview card={card} orientation={isPlot ? "horizontal" : "vertical"} className="size-full" />
                {handoff && !handoff.isDone && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={HANDOFF}
                        onAnimationComplete={() => setHandoff((open) => open && { ...open, isDone: true })}
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{ width: handoff.from.width, height: handoff.from.height, rotate: -handoff.degrees }}
                    >
                        <CardPreview
                            card={handoff.from.card}
                            orientation={handoff.from.isPlot ? "horizontal" : "vertical"}
                            className="size-full"
                        />
                    </motion.div>
                )}
            </motion.div>
            {children}
        </motion.div>
    );
}

type EditorCard = ComponentProps<typeof CardPreview>["card"];

type EditorCardPreviewProps = {
    card: EditorCard;
    isPlot: boolean;
    /** The width a vertical card is drawn at - a plot is drawn at that same size, on its side */
    verticalWidth: number;
    /** Held to the room its parent has, for an editor which stacks it over the inputs on a narrow screen */
    isClamped?: boolean;
    /** The room the card has is held as it was, while it changes to the card it is handed off to */
    isTurning?: boolean;
    /** The card on show fades off to the one now given, turning with it if need be, whenever this changes */
    handoffKey?: string;
    className?: string;
    /** Laid over the card - badges, say */
    children?: ReactNode;
    ref?: Ref<HTMLDivElement>;
    /** The card itself, which sits within the room it has - and fills it, but for while it is turning */
    faceRef?: Ref<HTMLDivElement>;
};
