import { Fragment, memo, useMemo } from "react";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { factions, IPlaytestCard } from "common/models/cards";
import CapsuleVisual from "./capsuleVisual";
import { noReorderPreview, slotNumberFromItemId } from "./releaseDnd";

// Stays mounted at all times so an in-progress drag never loses its sortable source
function DevelopmentPanel({ itemIds, cardsByNumber, isInteractive, isVisible }: DevelopmentPanelProps) {
    // Grouped by faction, canonical order - stable sort keeps each faction's existing relative order
    const sortedIds = useMemo(() => {
        const factionOf = (id: string) => cardsByNumber.get(slotNumberFromItemId(id)!)?.faction;
        return [...itemIds].sort((a, b) => factions.indexOf(factionOf(a)!) - factions.indexOf(factionOf(b)!));
    }, [itemIds, cardsByNumber]);

    return (
        <SortableContext items={sortedIds} strategy={noReorderPreview}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-h-9">
                {sortedIds.map((id, index) => {
                    const slotNumber = slotNumberFromItemId(id)!;
                    const card = cardsByNumber.get(slotNumber);
                    if (!card) {
                        return null;
                    }
                    const previousSlotNumber = index > 0 ? slotNumberFromItemId(sortedIds[index - 1])! : undefined;
                    const isNewFactionGroup =
                        previousSlotNumber !== undefined &&
                        cardsByNumber.get(previousSlotNumber)?.faction !== card.faction;
                    return (
                        <Fragment key={id}>
                            {isNewFactionGroup && <div className="col-span-full border-t border-content3" />}
                            <PoolCapsule id={id} card={card} isInteractive={isInteractive} isVisible={isVisible} />
                        </Fragment>
                    );
                })}
            </div>
        </SortableContext>
    );
}
export default memo(DevelopmentPanel);
type DevelopmentPanelProps = {
    itemIds: string[];
    cardsByNumber: Map<number, IPlaytestCard>;
    isInteractive: boolean;
    isVisible: boolean;
};

function PoolCapsule({ id, card, isInteractive, isVisible }: PoolCapsuleProps) {
    // Object form disabled is required to pull chips out of collision detection - boolean only disables dragging, not droppable
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        data: { faction: card.faction },
        disabled: { draggable: !isInteractive, droppable: !isInteractive }
    });
    // Both values are strings, so this settles between renders and the memoised capsule bails out
    const transformValue = CSS.Transform.toString(transform);
    const style = useMemo(() => ({ transform: transformValue, transition }), [transformValue, transition]);

    if (isDragging) {
        return <div ref={setNodeRef} style={style} className="h-9 rounded-md border-2 border-dashed border-content3" />;
    }

    // Holds the sortable's node without drawing a capsule the closed panel wouldn't show
    if (!isVisible) {
        return <div ref={setNodeRef} className="h-9" />;
    }

    return (
        <CapsuleVisual
            card={card}
            style={style}
            ref={setNodeRef}
            listeners={listeners}
            attributes={attributes}
            className="h-9"
            flipSlot={card.number}
            showProgress
        />
    );
}
type PoolCapsuleProps = {
    id: string;
    card: IPlaytestCard;
    isInteractive: boolean;
    isVisible: boolean;
};
