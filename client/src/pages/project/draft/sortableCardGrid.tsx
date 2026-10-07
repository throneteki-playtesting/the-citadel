import { memo, ReactNode, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import classNames from "classnames";
import { IPlaytestCard } from "common/models/cards";
import { preferenceLabel } from "common/models/slots";
import { useDragSensors } from "../../../hooks/useDragSensors";
import { CARD_BASE } from "../../../constants";
import { dropAnimation } from "../releases/releaseDnd";

const FADE = { duration: 0.2 } as const;

// Cards laid out to be dragged into order of preference, each over a dotted outline marking a place it can go
export default function SortableCardGrid({
    cards,
    cardWidth,
    hasNonPlot,
    isShown = true,
    flightNodes,
    renderCard,
    onReorder
}: SortableCardGridProps) {
    const sensors = useDragSensors();
    const [activeId, setActiveId] = useState<string>();
    const [overId, setOverId] = useState<string>();

    // The same array until the order really changes - dnd-kit takes a new one to mean the list changed, and stops
    // easing the cards it displaces
    const currentIds = cards.map(({ id }) => id);
    const [ids, setIds] = useState(currentIds);
    if (ids.join() !== currentIds.join()) {
        setIds(currentIds);
    }
    // Where every card would sit if dropped now - so each rank reads as it would, while still being dragged
    const projected = activeId && overId ? arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId)) : ids;
    const active = cards.find(({ id }) => id === activeId);

    const endDrag = () => {
        setActiveId(undefined);
        setOverId(undefined);
    };
    const onDragEnd = () => {
        const next = projected;
        endDrag();
        if (next.join() !== ids.join()) {
            onReorder(next);
        }
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={({ active }) => setActiveId(active.id as string)}
            onDragOver={({ over }) => setOverId(over?.id as string | undefined)}
            onDragEnd={onDragEnd}
            onDragCancel={endDrag}
        >
            <SortableContext items={ids} strategy={rectSortingStrategy}>
                <div className="relative flex flex-wrap justify-center gap-4">
                    {cards.map(({ id, card }, index) => (
                        <SortableOption
                            key={id}
                            id={id}
                            card={card}
                            index={index}
                            rank={projected.indexOf(id)}
                            hasNonPlot={hasNonPlot}
                            cardWidth={cardWidth}
                            isShown={isShown}
                            flightNodes={flightNodes}
                            renderCard={renderCard}
                        />
                    ))}
                </div>
            </SortableContext>
            {createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {active && (
                        <div className="relative cursor-grabbing" style={{ width: cardWidth }}>
                            {renderCard(active, projected.indexOf(active.id), true)}
                        </div>
                    )}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}

// The card face's corner, scaled from its base size to the width it is drawn at
function cornerRadius(width: number, isLandscape: boolean) {
    return (CARD_BASE.cornerRadius * width) / (isLandscape ? CARD_BASE.height : CARD_BASE.width);
}

// Its cell holds still while the card in it moves, so the outline beneath marks a place a card can go
const SortableOption = memo(function SortableOption({
    id,
    card,
    index,
    rank,
    hasNonPlot,
    cardWidth,
    isShown,
    flightNodes,
    renderCard
}: SortableOptionProps) {
    const flightRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (node) {
                flightNodes.set(id, node);
            } else {
                flightNodes.delete(id);
            }
        },
        [flightNodes, id]
    );
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        disabled: !isShown
    });
    return (
        <div className="relative flex flex-col gap-1" style={{ width: cardWidth }}>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: isShown ? 1 : 0 }}
                transition={FADE}
                className="absolute inset-x-0 bottom-0 top-5 border-2 border-dashed border-foreground/20"
                style={{ borderRadius: cornerRadius(cardWidth, card.type === "plot" && !hasNonPlot) }}
            />
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: isShown ? 1 : 0 }} transition={FADE}>
                <RankLabel rank={index} />
            </motion.div>
            <div
                ref={setNodeRef}
                {...attributes}
                {...listeners}
                style={{ transform: CSS.Transform.toString(transform), transition }}
                className={classNames("relative touch-manipulation select-none", {
                    "cursor-grab": isShown,
                    "opacity-0": isDragging
                })}
            >
                <div ref={flightRef} className="relative">
                    {renderCard({ id, card }, rank, false)}
                </div>
            </div>
        </div>
    );
});

function RankLabel({ rank }: { rank: number }) {
    return (
        <span
            className={classNames(
                "block font-cinzel text-xs uppercase tracking-wide",
                rank === 0 ? "text-primary" : "text-foreground/60"
            )}
        >
            {preferenceLabel(rank)}
        </span>
    );
}

/** A card by an id unique among its siblings */
export type SortableCard = { id: string; card: IPlaytestCard };

type SortableCardGridProps = {
    cards: SortableCard[];
    /** The width a card is drawn at on the draft page */
    cardWidth: number;
    /** The slot holds something other than a plot, so plots stand upright in it */
    hasNonPlot: boolean;
    /** On show - not while the cards fly in or out, when nothing can be dragged */
    isShown?: boolean;
    /** Each card's element by id, so the cards can be flown from where they sit */
    flightNodes: Map<string, HTMLElement>;
    /** Draws a card at its rank - lifted by the cursor when `isOverlay` */
    renderCard: (item: SortableCard, rank: number, isOverlay: boolean) => ReactNode;
    /** The ids in their new order, once a card is dropped somewhere new */
    onReorder: (ids: string[]) => void;
};

type SortableOptionProps = SortableCard &
    Pick<SortableCardGridProps, "hasNonPlot" | "cardWidth" | "renderCard"> & {
        /** Where its place sits in the grid - which is what the label above it names */
        index: number;
        /** Where the card would sit if dropped now */
        rank: number;
        isShown: boolean;
        flightNodes: Map<string, HTMLElement>;
    };
