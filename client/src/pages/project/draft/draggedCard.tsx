import { CSSProperties, memo, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DragOverlay, Modifier } from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { CardPreview } from "@agot/card-preview";
import classNames from "classnames";
import { slotConditionIssues } from "common/models/slotConditions";
import Crossfade from "../../../components/crossfade";
import { rotatingDropAnimation } from "../../../animations";
import { slotShape } from "./slotShape";
import { DRAFT_SLOT_LIST_SELECTOR, DRAFT_SLOT_VARIABLES_CLASS, POOL_PULL_MS } from "../../../constants";
import { isPreviewedCard, previewOf } from "common/models/slots";
import { DraftCardBadges } from "./draftCardContent";
import { CardAction, CardHandlers, useCardActions } from "./useCardActions";
import { DragData, DragStoreContext, useDragState } from "./draftDragStore";
import { poolDropAnimation } from "./poolDropAnimation";
import { useHeldOpen } from "../../../hooks/useHeldOpen";
import { DraftSlot, FactionSlots, findDraftSlot, renderDraftCard } from "./draftSlots";

// A card from the pool is a thumbnail in hand, so the full card is held by its middle
const centreCardsFromPool: Modifier = (args) =>
    args.active?.data.current?.suggestion ? snapCenterToCursor(args) : args.transform;

// Over the draft pool the card is drawn to the middle of it, and follows the pointer again once that leaves
const pullToPool: Modifier = ({ active, over, activeNodeRect, transform }) => {
    if (!over?.data.current?.pool || !activeNodeRect || active?.data.current?.suggestion) {
        return transform;
    }
    return {
        ...transform,
        x: over.rect.left + over.rect.width / 2 - (activeNodeRect.left + activeNodeRect.width / 2),
        y: over.rect.top + over.rect.height / 2 - (activeNodeRect.top + activeNodeRect.height / 2)
    };
};

// Reads the drag itself, so a change of slot under the card redraws the card in hand and nothing around it
const DraftDragOverlay = memo(function DraftDragOverlay({ factionSlots, ...handlers }: DraftDragOverlayProps) {
    const active = useDragState((state) => state.active);
    const over = useDragState((state) => state.over);
    const isHeld = useDragState((state) => state.held !== undefined);
    const isOverPool = useDragState((state) => !!state.isOverPool);
    // Eased only as it goes to the pool or comes away from it - otherwise the card keeps up with the pointer
    const isPulling = useHeldOpen(isOverPool, POOL_PULL_MS);
    const actionsFor = useCardActions(handlers);
    const store = useContext(DragStoreContext);
    const dropAnimation = useMemo(() => (store ? poolDropAnimation(store) : rotatingDropAnimation), [store]);
    // Portalled, as dnd-kit advises, so no transformed or clipping ancestor can shift or cut off the card in hand
    return createPortal(
        <DragOverlay
            dropAnimation={dropAnimation}
            modifiers={[centreCardsFromPool, pullToPool]}
            transition={isPulling ? `transform ${POOL_PULL_MS}ms ease-out` : undefined}
        >
            {active && !isHeld && (
                <DraggedCard
                    drag={active}
                    source={findDraftSlot(factionSlots, active.slotNumber)}
                    over={over === undefined ? undefined : findDraftSlot(factionSlots, over)}
                    isOverPool={isOverPool}
                    actions={actionsFor(active.card)}
                />
            )}
        </DragOverlay>,
        document.body
    );
});

export default DraftDragOverlay;

type DraftDragOverlayProps = CardHandlers & { factionSlots: FactionSlots };

// Reads as it would land - the slot beneath's number, faction and conditions, and its place there as the Favoured
function DraggedCard({ drag, source, over, isOverPool, actions }: DraggedCardProps) {
    const isMoving = !!over && over.number !== drag.slotNumber;
    const slot = isMoving ? over : source;
    const card = slot && slot.faction !== drag.card.faction ? { ...drag.card, faction: slot.faction } : drag.card;
    const rank = isMoving ? 0 : (source?.options.findIndex((option) => option.version === card.version) ?? 0);
    const number = slot?.number ?? drag.slotNumber;
    // Marked in hand while it is, or would be, the revealed card of the slot under it
    const preview = slot && previewOf(slot.slot);
    const isRevealed = !!preview && isPreviewedCard(drag.card, preview);
    // A plot, or a card from the pool, is the size of a slot's - one from a stack is already sized by the card it left
    const hasSlotShape = card.type === "plot" || !!drag.suggestion;
    // Every faction's slot list is as wide as the next, so any of them gives the width its slots are sized against
    const [listWidth] = useState(() => document.querySelector(DRAFT_SLOT_LIST_SELECTOR)?.clientWidth);
    const isSlotSized = hasSlotShape && listWidth !== undefined;
    const shape: (CSSProperties & { "--draft-w"?: string }) | undefined = isSlotSized
        ? { ...slotShape(card.type === "plot"), "--draft-w": `${listWidth}px` }
        : undefined;
    // The overlay is sized to whatever it was picked up from - a thumbnail in the pool, or a tilted card in a pile - so
    // the card is centred in it rather than hung from its corner, and sits where that was and under the cursor
    return (
        <div className="relative size-full">
            <div
                data-drag-card
                className={classNames(
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grabbing transition-[scale,opacity] duration-200 ease-out",
                    isSlotSized ? DRAFT_SLOT_VARIABLES_CLASS : "size-full",
                    isOverPool && "scale-50 opacity-60 sm:opacity-100"
                )}
                style={shape}
            >
                <DraftCardBadges
                    issues={slotConditionIssues(slot?.slot.conditions, card)}
                    actions={actions}
                    reveal={isRevealed ? "current" : undefined}
                />
                <Crossfade contentKey={`${number}|${rank}|${card.faction}`}>
                    <CardPreview
                        orientation={card.type === "plot" ? "horizontal" : undefined}
                        card={renderDraftCard(card, rank, number)}
                    />
                </Crossfade>
            </div>
        </div>
    );
}

type DraggedCardProps = {
    drag: DragData;
    source?: DraftSlot;
    over?: DraftSlot;
    /** It is over the draft pool, where it would be taken in - so it shrinks to say so */
    isOverPool: boolean;
    actions: CardAction[];
};
