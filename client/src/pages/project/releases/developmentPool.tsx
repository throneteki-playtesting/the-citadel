import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { IPlaytestCard } from "common/models/cards";
import CapsuleVisual from "./capsuleVisual";
import { noReorderPreview, POOL_ID, slotNumberFromItemId } from "./releaseDnd";

export default function DevelopmentPool({ itemIds, cardsByNumber, isCollapsed, onToggle, isHovered }: DevelopmentPoolProps) {
    const { setNodeRef, isOver } = useDroppable({ id: POOL_ID });

    return (
        <div ref={setNodeRef} className={classNames("border border-content3 bg-content1 p-3 transition-colors", { "border-primary": isOver || isHovered })}>
            <div className="flex items-center gap-2 cursor-pointer" onClick={onToggle}>
                <FontAwesomeIcon icon={faChevronRight} className={classNames("text-foreground/50 transition-transform duration-200", { "rotate-90": !isCollapsed })}/>
                <div className="text-lg font-cinzel tracking-wide">Development ({itemIds.length})</div>
            </div>
            <AnimatePresence initial={false}>
                {!isCollapsed && (
                    <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <SortableContext items={itemIds} strategy={noReorderPreview}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-h-8 mt-2">
                                {itemIds.map((id) => {
                                    const slotNumber = slotNumberFromItemId(id)!;
                                    const card = cardsByNumber.get(slotNumber);
                                    return card ? <PoolCapsule key={id} id={id} card={card}/> : null;
                                })}
                            </div>
                        </SortableContext>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
type DevelopmentPoolProps = {
    itemIds: string[];
    cardsByNumber: Map<number, IPlaytestCard>;
    isCollapsed: boolean;
    onToggle: () => void;
    isHovered: boolean;
}

function PoolCapsule({ id, card }: PoolCapsuleProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { faction: card.faction } });
    const style = { transform: CSS.Transform.toString(transform), transition };

    if (isDragging) {
        return <div ref={setNodeRef} style={style} className="h-8 rounded-md border-2 border-dashed border-content3"/>;
    }

    return (
        <CapsuleVisual
            card={card}
            style={style}
            forwardRef={setNodeRef}
            listeners={listeners}
            attributes={attributes}
            className="h-8"
            flipSlot={card.number}
        />
    );
}
type PoolCapsuleProps = {
    id: string;
    card: IPlaytestCard;
}
