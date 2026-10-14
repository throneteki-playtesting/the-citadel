import { ComponentProps, memo } from "react";
import { motion } from "framer-motion";
import classNames from "classnames";
import { CardPreview } from "@agot/card-preview";
import { IPlaytestCard } from "common/models/cards";
import { SlotCondition, slotConditionIssues } from "common/models/slotConditions";
import Crossfade from "../../../components/crossfade";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { CardHandlers, useCardActions } from "./useCardActions";
import { CardAction, SlotCardBadges } from "../../../components/slots/slotCardBadges";
import { renderDraftCard } from "./draftSlots";
import { renderPlaytestingCard } from "common/utils";
import { QUARTER_TURN, SHAPE_TRANSITION, SIZE_TRANSITION_CLASS, plotShape } from "./slotShape";

// Memoised, so a slot redrawing for a drag only redraws the cards whose rank it changes
const DraftCardContent = memo(function DraftCardContent({
    card,
    rank,
    slotNumber,
    conditions,
    isUpright,
    isRevealed,
    isGhost,
    isCovered,
    extraActions,
    onEdit,
    onDelete
}: DraftCardContentProps) {
    const ownActions = useCardActions({ onEdit, onDelete })(card);
    const actions = extraActions ? [...extraActions, ...ownActions] : ownActions;
    const face = isGhost ? renderGhostFace(card, slotNumber) : renderDraftCard(card, rank, slotNumber);
    const reveal = isGhost ? (isCovered ? "current" : "removed") : isRevealed ? "current" : undefined;
    return (
        <div className="size-full relative">
            <SlotCardBadges
                issues={isGhost ? [] : slotConditionIssues(conditions, card)}
                actions={isGhost ? [] : actions}
                reveal={reveal}
            />
            <motion.div
                className="size-full"
                initial={false}
                animate={
                    isGhost
                        ? { opacity: 1, filter: "grayscale(1) brightness(0.45)" }
                        : { opacity: 1, filter: "grayscale(0) brightness(1)" }
                }
                transition={{ duration: 0.5 }}
            >
                {card.type === "plot" ? (
                    <PlotFace card={face} isUpright={isUpright} />
                ) : (
                    <div className="relative h-full flex justify-center items-center">
                        <div className="relative w-full">
                            <Crossfade contentKey={`${String(card.updated)}|${rank}`}>
                                <CardPreview className="select-none" card={face} />
                            </Crossfade>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
});

function renderGhostFace(card: IPlaytestCard, slotNumber: number) {
    return renderPlaytestingCard(card, {
        top: "Removed Card",
        middle: `Card #${slotNumber}`,
        bottom: "Still Revealed"
    });
}

export default DraftCardContent;

// A plot is drawn on its side and stood upright by turning it, so a slot gaining a card which isn't a plot turns the
// plots in it rather than swapping them
function PlotFace({ card, isUpright }: PlotFaceProps) {
    const prefersReducedMotion = useReducedMotion();
    return (
        <div className="relative size-full">
            <motion.div
                initial={false}
                animate={{ rotate: isUpright ? -QUARTER_TURN : 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : SHAPE_TRANSITION}
                className={classNames(
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                    SIZE_TRANSITION_CLASS
                )}
                style={plotShape(isUpright)}
            >
                <CardPreview className="size-full select-none" orientation="horizontal" card={card} />
            </motion.div>
        </div>
    );
}

type PlotFaceProps = {
    card: ComponentProps<typeof CardPreview>["card"];
    isUpright: boolean;
};

type DraftCardContentProps = CardHandlers & {
    card: IPlaytestCard;
    rank: number;
    slotNumber: number;
    conditions?: SlotCondition[];
    isUpright: boolean;
    /** It is the card its slot has revealed to the design team */
    isRevealed?: boolean;
    /** It has been removed from its slot, but is still what the slot has revealed */
    isGhost?: boolean;
    /** The card it stands behind is still in its slot, so it is the revealed card, not a removed one */
    isCovered?: boolean;
    /** What else can be done with this card, beside editing and deleting it */
    extraActions?: CardAction[];
};
