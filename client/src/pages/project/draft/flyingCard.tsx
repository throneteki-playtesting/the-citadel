import { Ref } from "react";
import { motion, Transition } from "framer-motion";
import { CardPreview } from "@agot/card-preview";
import { IPlaytestCard } from "common/models/cards";
import { CardActionsControl, DraftCardBadges } from "./draftCardContent";
import { renderDraftCard } from "./draftSlots";
import { EDIT_ACTION, MENU_ACTIONS } from "./cardMenuActions";

/** The control over a card's corner: an edit button (the review), the stack's menu, or nothing (an editor's preview) */
export type CardControl = "none" | "button" | "menu";

// A copy of a card drawn above the page to be carried between places, its control changing as it goes
export default function FlyingCard({
    card,
    rank,
    isUpright,
    from,
    issues,
    fromControl,
    toControl,
    stackWidth,
    isMorphing,
    transition,
    zIndex,
    ref
}: FlyingCardProps) {
    return (
        <div
            ref={ref}
            className="pointer-events-none fixed"
            style={{ left: from.left, top: from.top, width: from.width, zIndex }}
        >
            <CardPreview
                orientation={isUpright ? "vertical" : undefined}
                card={renderDraftCard(card, rank, card.number)}
            />
            <div
                className="absolute inset-0 z-10 origin-top-right"
                style={{ transform: `scale(${Math.min(from.width, from.height) / stackWidth})` }}
            >
                <DraftCardBadges
                    issues={issues}
                    actions={[]}
                    trailing={
                        <ControlMorph
                            from={fromControl}
                            to={toControl}
                            isMorphing={isMorphing}
                            transition={transition}
                        />
                    }
                />
            </div>
        </div>
    );
}

const CONTROL_PX = 32;
const BADGE_GAP_PX = 6;
const widthOf = (control: CardControl) => (control === "none" ? 0 : CONTROL_PX);
// A control with no width still has the row's gap beside it, which is taken back so the badges beside it settle flush
const gapTaken = (width: number) => -BADGE_GAP_PX * (1 - width / CONTROL_PX);

// One control turning into another: the first fades out as the second fades in, and the room they take opens or closes
// with them, so the badges beside it glide rather than jump
export function ControlMorph({ from, to, isMorphing, transition }: ControlMorphProps) {
    const width = widthOf(isMorphing ? to : from);
    return (
        <motion.div
            initial={{ width: widthOf(from), marginLeft: gapTaken(widthOf(from)) }}
            animate={{ width, marginLeft: gapTaken(width) }}
            transition={transition}
            className="grid justify-items-start"
        >
            <ControlLayer control={from} initialOpacity={1} opacity={isMorphing ? 0 : 1} transition={transition} />
            <ControlLayer control={to} initialOpacity={0} opacity={isMorphing ? 1 : 0} transition={transition} />
        </motion.div>
    );
}

type ControlMorphProps = {
    from: CardControl;
    to: CardControl;
    /** Heading for `to`, rather than still `from` */
    isMorphing: boolean;
    transition: Transition;
};

function ControlLayer({
    control,
    initialOpacity,
    opacity,
    transition
}: {
    control: CardControl;
    initialOpacity: number;
    opacity: number;
    transition: Transition;
}) {
    if (control === "none") {
        return null;
    }
    return (
        <motion.div
            initial={{ opacity: initialOpacity }}
            animate={{ opacity }}
            transition={transition}
            className="col-start-1 row-start-1"
        >
            <CardActionsControl
                actions={control === "button" ? [EDIT_ACTION] : MENU_ACTIONS}
                isButton={control === "button"}
            />
        </motion.div>
    );
}

type FlyingCardProps = {
    card: IPlaytestCard;
    rank: number;
    isUpright: boolean;
    /** Where the copy is drawn, until it is moved */
    from: DOMRect;
    issues: string[];
    fromControl: CardControl;
    toControl: CardControl;
    /** The width a card is drawn at in its stack, where the badges are their regular size - they scale with the card from there */
    stackWidth: number;
    /** The journey has begun, so the control starts to change */
    isMorphing: boolean;
    transition: Transition;
    zIndex: number;
    ref?: Ref<HTMLDivElement>;
};
