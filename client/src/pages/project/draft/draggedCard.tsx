import { memo } from "react";
import { createPortal } from "react-dom";
import { DragOverlay } from "@dnd-kit/core";
import { CardPreview } from "@agot/card-preview";
import classNames from "classnames";
import { slotConditionIssues } from "common/models/slotConditions";
import Crossfade from "../../../components/crossfade";
import { rotatingDropAnimation } from "../../../animations";
import { DRAFT_PLOT_WIDTH_CLASS, LANDSCAPE_ASPECT_CLASS } from "../../../constants";
import { DraftCardBadges } from "./draftCardContent";
import { CardAction, CardHandlers, useCardActions } from "./useCardActions";
import { DragData, useDragState } from "./draftDragStore";
import { DraftSlot, FactionSlots, findDraftSlot, renderDraftCard } from "./draftSlots";

// Reads the drag itself, so a change of slot under the card redraws the card in hand and nothing around it
const DraftDragOverlay = memo(function DraftDragOverlay({ factionSlots, ...handlers }: DraftDragOverlayProps) {
    const active = useDragState((state) => state.active);
    const over = useDragState((state) => state.over);
    const isHeld = useDragState((state) => state.held !== undefined);
    const actionsFor = useCardActions(handlers);
    // Portalled, as dnd-kit advises, so no transformed or clipping ancestor can shift or cut off the card in hand
    return createPortal(
        <DragOverlay dropAnimation={rotatingDropAnimation}>
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
    return (
        <div
            className={classNames(
                "relative cursor-grabbing",
                card.type === "plot" ? classNames(DRAFT_PLOT_WIDTH_CLASS, LANDSCAPE_ASPECT_CLASS) : "size-full"
            )}
        >
            <DraftCardBadges issues={slotConditionIssues(slot?.slot.conditions, card)} actions={actions} />
            <Crossfade contentKey={`${number}|${rank}|${card.faction}`}>
                <CardPreview
                    orientation={card.type === "plot" ? "horizontal" : undefined}
                    card={renderDraftCard(card, rank, number)}
                />
            </Crossfade>
        </div>
    );
}

type DraggedCardProps = {
    drag: DragData;
    source?: DraftSlot;
    over?: DraftSlot;
    actions: CardAction[];
};
