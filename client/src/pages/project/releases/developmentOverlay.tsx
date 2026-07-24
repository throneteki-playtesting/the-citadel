import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { Button } from "@heroui/react";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faXmark } from "@fortawesome/free-solid-svg-icons";
import { IPlaytestCard } from "common/models/cards";
import DevelopmentPanel from "./developmentPool";
import { POOL_ID, POOL_MOBILE_TRIGGER_ID } from "./releaseDnd";

// Mirrors the modal's w-[min(92vw,56rem)] h-[min(80vh,40rem)] classes below in plain pixels, for the animation targets
function modalSize() {
    return {
        width: Math.min(window.innerWidth * 0.92, 896),
        height: Math.min(window.innerHeight * 0.8, 640)
    };
}
function useModalSize() {
    const [size, setSize] = useState(modalSize);
    useEffect(() => {
        const onResize = () => setSize(modalSize());
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return size;
}

// The chip grid stays mounted (only transformed) so a drag never loses its source. The modal itself
// isn't droppable - DevelopmentPoolButton (desktop) and the bubble below (mobile) are the only targets
export default function DevelopmentOverlay({ itemIds, count, cardsByNumber, isOpen, onOpen, onClose, originRect }: DevelopmentOverlayProps) {
    const { measureDroppableContainers } = useDndContext();
    const bubbleRef = useRef<HTMLButtonElement>(null);
    const { setNodeRef: setBubbleDropRef, isOver: isBubbleOver } = useDroppable({ id: POOL_MOBILE_TRIGGER_ID, disabled: isOpen });
    const combinedBubbleRef = (node: HTMLButtonElement | null) => {
        bubbleRef.current = node;
        setBubbleDropRef(node);
    };
    const dragControls = useDragControls();
    const { width, height } = useModalSize();
    // Chips stay non-interactive until the open animation settles, or a mid-scale pickup sizes the drag overlay wrong
    const [isSettled, setIsSettled] = useState(false);
    useEffect(() => {
        if (!isOpen) {
            setIsSettled(false);
        }
    }, [isOpen]);

    const target = { x: window.innerWidth / 2 - width / 2, y: window.innerHeight / 2 - height / 2, scale: 1, opacity: 1 };
    const origin = originRect
        ? {
            x: originRect.left + originRect.width / 2 - width / 2,
            y: originRect.top + originRect.height / 2 - height / 2,
            scale: Math.max(originRect.width / width, 0.05),
            opacity: 0
        }
        : { ...target, scale: 0.05, opacity: 0 };

    return createPortal(
        <>
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        ref={combinedBubbleRef}
                        key="mobile-bubble"
                        type="button"
                        disabled={count === 0}
                        onClick={() => count > 0 && bubbleRef.current && onOpen(bubbleRef.current.getBoundingClientRect())}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        // Re-measure once its own mount-in animation finishes, in case a drop settled mid-scale
                        onAnimationComplete={() => measureDroppableContainers([POOL_MOBILE_TRIGGER_ID])}
                        className="sm:hidden fixed z-30 bottom-6 left-4 p-3 -m-3"
                    >
                        <div className={classNames(
                            "flex items-center justify-center gap-1 size-14 rounded-full border-2 shadow-lg transition-all",
                            count === 0 ? "border-content3 bg-content1 opacity-40" : isBubbleOver ? "border-primary bg-primary/20 scale-110" : "border-content3 bg-content1"
                        )}>
                            <FontAwesomeIcon icon={faLayerGroup} className="text-foreground/60"/>
                            <span className="text-sm font-semibold">{count}</span>
                        </div>
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="backdrop"
                        className="fixed inset-0 z-20 bg-black/60"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                )}
            </AnimatePresence>

            <motion.div
                drag
                dragControls={dragControls}
                dragListener={false}
                dragMomentum={false}
                dragElastic={0}
                style={{ top: 0, left: 0, width, height }}
                initial={false}
                animate={isOpen ? target : origin}
                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                onAnimationComplete={() => {
                    if (isOpen) {
                        setIsSettled(true);
                    }
                }}
                className={classNames(
                    "fixed z-30 border-2 border-content3 bg-content1 shadow-2xl flex flex-col",
                    { "pointer-events-none": !isOpen }
                )}
            >
                <div
                    className="flex items-center gap-2 px-3 py-2 border-b border-content3 shrink-0 cursor-grab active:cursor-grabbing touch-none"
                    onPointerDown={(e) => {
                        if (!(e.target as HTMLElement).closest("button")) {
                            dragControls.start(e);
                        }
                    }}
                >
                    <div className="flex-1 text-lg font-cinzel tracking-wide">Development Pool ({count})</div>
                    <Button isIconOnly size="sm" variant="light" onPress={onClose}>
                        <FontAwesomeIcon icon={faXmark}/>
                    </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    <DevelopmentPanel itemIds={itemIds} cardsByNumber={cardsByNumber} isInteractive={isOpen && isSettled}/>
                </div>
            </motion.div>
        </>,
        document.body
    );
}
type DevelopmentOverlayProps = {
    itemIds: string[];
    // Distinct from itemIds.length, which includes a hover-preview arrival mid-drag (see withHover)
    count: number;
    cardsByNumber: Map<number, IPlaytestCard>;
    isOpen: boolean;
    onOpen: (rect: DOMRect) => void;
    onClose: () => void;
    originRect?: DOMRect;
}

// Desktop trigger beside "Add Release" - always mounted, droppable/interactive only while closed
export function DevelopmentPoolButton({ count, isOpen, onOpen }: DevelopmentPoolButtonProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { setNodeRef, isOver } = useDroppable({ id: POOL_ID, disabled: isOpen });
    const combinedRef = (node: HTMLDivElement | null) => {
        wrapperRef.current = node;
        setNodeRef(node);
    };

    // isDisabled only blocks opening - the droppable registration above stays keyed on isOpen alone
    return (
        <div ref={combinedRef} className={classNames("hidden sm:block relative p-2 -m-2", { "pointer-events-none": isOpen })}>
            <Button
                size="sm"
                variant="flat"
                isDisabled={isOpen || count === 0}
                className={classNames("transition-all", isOver ? "bg-primary/20 text-primary scale-110" : undefined, { "opacity-40": isOpen })}
                startContent={<FontAwesomeIcon icon={faLayerGroup}/>}
                onPress={() => wrapperRef.current && onOpen(wrapperRef.current.getBoundingClientRect())}
            >
                Development Pool ({count})
            </Button>
        </div>
    );
}
type DevelopmentPoolButtonProps = {
    count: number;
    isOpen: boolean;
    onOpen: (rect: DOMRect) => void;
}
