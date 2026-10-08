import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

const PANEL_WIDTH_VW = 0.92;
const PANEL_MAX_WIDTH = 896;
const PANEL_HEIGHT_VH = 0.8;
const PANEL_MAX_HEIGHT = 640;
const OPEN_TRANSITION = { duration: 0.25, ease: [0.25, 1, 0.5, 1] } as const;

// Mirrors the panel's size in plain pixels, for the animation targets
function panelSize() {
    return {
        width: Math.min(window.innerWidth * PANEL_WIDTH_VW, PANEL_MAX_WIDTH),
        height: Math.min(window.innerHeight * PANEL_HEIGHT_VH, PANEL_MAX_HEIGHT)
    };
}

function usePanelSize() {
    const [size, setSize] = useState(panelSize);
    useEffect(() => {
        const onResize = () => setSize(panelSize());
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return size;
}

// A panel which grows out of the button that opens it and can be moved by its header. It stays mounted, only
// transformed, so something picked up from inside it never loses the node it was picked up from
export default function FloatingPanel({
    title,
    isOpen,
    originRect,
    closeStyle = "shrink",
    onClose,
    onClosed,
    children
}: FloatingPanelProps) {
    const dragControls = useDragControls();
    const { width, height } = usePanelSize();
    // What is inside stays inert until the open animation settles, or a pick-up mid-scale sizes what is carried wrong
    const [isSettled, setIsSettled] = useState(false);
    useEffect(() => {
        if (!isOpen) {
            setIsSettled(false);
        }
    }, [isOpen]);

    const target = {
        x: window.innerWidth / 2 - width / 2,
        y: window.innerHeight / 2 - height / 2,
        scale: 1,
        opacity: 1
    };
    const origin = originRect
        ? {
              x: originRect.left + originRect.width / 2 - width / 2,
              y: originRect.top + originRect.height / 2 - height / 2,
              scale: Math.max(originRect.width / width, 0.05),
              opacity: 0
          }
        : { ...target, scale: 0.05, opacity: 0 };

    const away = closeStyle === "fade" ? { ...target, opacity: 0 } : origin;

    return createPortal(
        <>
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
                animate={isOpen ? target : away}
                transition={OPEN_TRANSITION}
                onAnimationComplete={() => (isOpen ? setIsSettled(true) : onClosed?.())}
                className={classNames("fixed z-30 flex flex-col border-2 border-content3 bg-content1 shadow-2xl", {
                    "pointer-events-none": !isOpen
                })}
            >
                <div
                    className="flex shrink-0 cursor-grab touch-none items-center gap-2 border-b border-content3 px-3 py-2 active:cursor-grabbing"
                    onPointerDown={(event) => {
                        if (!(event.target as HTMLElement).closest("button")) {
                            dragControls.start(event);
                        }
                    }}
                >
                    <div className="flex-1 font-cinzel text-lg tracking-wide">{title}</div>
                    <Button isIconOnly size="sm" variant="light" aria-label="Close" onPress={onClose}>
                        <FontAwesomeIcon icon={faXmark} />
                    </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">{children(isOpen && isSettled)}</div>
            </motion.div>
        </>,
        document.body
    );
}

type FloatingPanelProps = {
    title: ReactNode;
    isOpen: boolean;
    /** Where the panel grows from and shrinks back to - the button which opens it */
    originRect?: DOMRect;
    /** How it is put away: back into that button, or faded out where it is */
    closeStyle?: "shrink" | "fade";
    onClose: () => void;
    /** It has finished being put away */
    onClosed?: () => void;
    /** Given whether the panel is open and still, so what is picked up from it is only picked up then */
    children: (isInteractive: boolean) => ReactNode;
};
