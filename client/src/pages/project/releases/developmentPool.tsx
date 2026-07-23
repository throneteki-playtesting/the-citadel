import { Fragment, useMemo } from "react";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { factions, IPlaytestCard } from "common/models/cards";
import CapsuleVisual from "./capsuleVisual";
import { noReorderPreview, slotNumberFromItemId } from "./releaseDnd";

// Stays mounted at all times so an in-progress drag never loses its sortable source
export default function DevelopmentPanel({ itemIds, cardsByNumber, isInteractive }: DevelopmentPanelProps) {
    // Grouped by faction, canonical order - stable sort keeps each faction's existing relative order
    const sortedIds = useMemo(() => {
        const factionOf = (id: string) => cardsByNumber.get(slotNumberFromItemId(id)!)?.faction;
        return [...itemIds].sort((a, b) => factions.indexOf(factionOf(a)!) - factions.indexOf(factionOf(b)!));
    }, [itemIds, cardsByNumber]);

    return (
        <SortableContext items={sortedIds} strategy={noReorderPreview}>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 min-h-9">
                {sortedIds.map((id, index) => {
                    const slotNumber = slotNumberFromItemId(id)!;
                    const card = cardsByNumber.get(slotNumber);
                    if (!card) {
                        return null;
                    }
                    const previousSlotNumber = index > 0 ? slotNumberFromItemId(sortedIds[index - 1])! : undefined;
                    const isNewFactionGroup = previousSlotNumber !== undefined && cardsByNumber.get(previousSlotNumber)?.faction !== card.faction;
                    return (
                        <Fragment key={id}>
                            {isNewFactionGroup && <div className="col-span-full border-t border-content3"/>}
                            <PoolCapsule id={id} card={card} isInteractive={isInteractive}/>
                        </Fragment>
                    );
                })}
            </div>
        </SortableContext>
    );
}
type DevelopmentPanelProps = {
    itemIds: string[];
    cardsByNumber: Map<number, IPlaytestCard>;
    isInteractive: boolean;
}

function PoolCapsule({ id, card, isInteractive }: PoolCapsuleProps) {
    // Object form disabled is required to pull chips out of collision detection - boolean only disables dragging, not droppable
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        data: { faction: card.faction },
        disabled: { draggable: !isInteractive, droppable: !isInteractive }
    });
    const style = { transform: CSS.Transform.toString(transform), transition };

    if (isDragging) {
        return <div ref={setNodeRef} style={style} className="h-9 rounded-md border-2 border-dashed border-content3"/>;
    }

    return (
        <CapsuleVisual
            card={card}
            style={style}
            forwardRef={setNodeRef}
            listeners={listeners}
            attributes={attributes}
            className="h-9"
            flipSlot={card.number}
        />
    );
}
type PoolCapsuleProps = {
    id: string;
    card: IPlaytestCard;
    isInteractive: boolean;
}
