import { memo, useContext, useMemo } from "react";
import { createPortal } from "react-dom";
import { DragOverlay, Modifier } from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { CardPreview } from "@agot/card-preview";
import classNames from "classnames";
import { slotConditionIssues } from "common/models/slotConditions";
import Crossfade from "../../../components/crossfade";
import { rotatingDropAnimation } from "../../../animations";
import { slotShape } from "./slotShape";
import { DRAFT_SLOT_VARIABLES_CLASS } from "../../../constants";
import { DraftCardBadges } from "./draftCardContent";
import { CardAction, CardHandlers, useCardActions } from "./useCardActions";
import { DragData, DragStoreContext, useDragState } from "./draftDragStore";
import { poolDropAnimation } from "./poolDropAnimation";
import { DraftSlot, FactionSlots, findDraftSlot, renderDraftCard } from "./draftSlots";

// A card from the pool is a thumbnail in hand, so the full card is held by its middle
const centreCardsFromPool: Modifier = (args) =>
    args.active?.data.current?.suggestion ? snapCenterToCursor(args) : args.transform;

// Reads the drag itself, so a change of slot under the card redraws the card in hand and nothing around it
const DraftDragOverlay = memo(function DraftDragOverlay({ factionSlots, ...handlers }: DraftDragOverlayProps) {
    const active = useDragState((state) => state.active);
    const over = useDragState((state) => state.over);
    const isHeld = useDragState((state) => state.held !== undefined);
    const actionsFor = useCardActions(handlers);
    const store = useContext(DragStoreContext);
    const dropAnimation = useMemo(() => (store ? poolDropAnimation(store) : rotatingDropAnimation), [store]);
    // Portalled, as dnd-kit advises, so no transformed or clipping ancestor can shift or cut off the card in hand
    return createPortal(
        <DragOverlay dropAnimation={dropAnimation} modifiers={[centreCardsFromPool]}>
            {active && !isHeld && (
                <DraggedCard
                    drag={active}
                    source={findDraftSlot(factionSlots, active.slotNumber)}
                    over={over === undefined ? undefined : findDraftSlot(factionSlots, over)}
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
function DraggedCard({ drag, source, over, actions }: DraggedCardProps) {
    const isMoving = !!over && over.number !== drag.slotNumber;
    const slot = isMoving ? over : source;
    const card = slot && slot.faction !== drag.card.faction ? { ...drag.card, faction: slot.faction } : drag.card;
    const rank = isMoving ? 0 : (source?.options.findIndex((option) => option.version === card.version) ?? 0);
    const number = slot?.number ?? drag.slotNumber;
    // A plot, or a card from the pool, is the size of a slot's - one from a stack is already sized by the card it left
    const hasSlotShape = card.type === "plot" || !!drag.suggestion;
    // The overlay is sized to whatever it was picked up from - a thumbnail in the pool, or a tilted card in a pile - so
    // the card is centred in it rather than hung from its corner, and sits where that was and under the cursor
    return (
        <div className="relative size-full">
            <div
                data-drag-card
                className={classNames(
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grabbing",
                    hasSlotShape ? DRAFT_SLOT_VARIABLES_CLASS : "size-full"
                )}
                style={hasSlotShape ? slotShape(card.type === "plot") : undefined}
            >
                <DraftCardBadges issues={slotConditionIssues(slot?.slot.conditions, card)} actions={actions} />
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
    actions: CardAction[];
};
