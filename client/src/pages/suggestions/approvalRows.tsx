import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Skeleton } from "@heroui/react";
import classNames from "classnames";
import { ICardSuggestion } from "common/models/cards";
import { BaseElementProps } from "../../types";

export const APPROVAL_ROWS_SIZE = 5;
// A comfortable height for the 2-line row content, times 5 slots. Fixed, not `flex-1` - this section
// sits inside SlidingPages' absolutely-positioned pages, which give `flex-1` nothing to grow against.
const ROW_HEIGHT = 80;
const TOTAL_HEIGHT = APPROVAL_ROWS_SIZE * ROW_HEIGHT;

// This section's own SlidingPages clip hides the OTHER (inactive) list beside the visible one, so a
// swiped-out row can't travel far enough to escape - it fades out mid-flight instead (~60% of travel).
const SWIPE_DISTANCE = 90;
const SWAP_TRANSITION = { duration: 0.4, ease: [0.22, 1, 0.36, 1] } as const;
const FADE_TRANSITION = { duration: 0.22, ease: "easeIn" } as const;
// Split out from SWAP_TRANSITION so every row shares the SAME fixed `layout` transition with no
// per-row delay, or "move up simultaneously" becomes "move up one at a time".
const ROW_TRANSITION = { layout: SWAP_TRANSITION, x: SWAP_TRANSITION, opacity: FADE_TRANSITION };

// Shared by Recently Approved and Awaiting Approval - always exactly APPROVAL_ROWS_SIZE row slots,
// filled from the top and left blank below. `min-h-0` on every row keeps that split genuinely even.

// No entrance animation of its own (the section already fades in as a whole) - `initial={false}`
// only suppresses that at first mount; a row backfilling a vacated slot later still swipes in.
export default function ApprovalRows({
    items,
    isLoading,
    emptyMessage,
    renderRow,
    className,
    style
}: ApprovalRowsProps) {
    const wrapperClassName = classNames("border border-content3 flex flex-col shrink-0", className);
    const wrapperStyle = { ...style, height: TOTAL_HEIGHT };

    if (isLoading) {
        return (
            <div className={wrapperClassName} style={wrapperStyle}>
                <div className="flex-1 flex flex-col divide-y divide-content3">
                    {Array.from({ length: APPROVAL_ROWS_SIZE }).map((_, index) => (
                        <div key={index} className="flex-1 min-h-0 flex flex-col justify-center gap-1 px-4 py-3">
                            <Skeleton className="w-40 h-4 rounded-sm" />
                            <Skeleton className="w-28 h-3 rounded-sm" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className={wrapperClassName} style={wrapperStyle}>
                <div className="flex-1 flex items-center justify-center text-center text-sm text-foreground/40 p-8">
                    {emptyMessage}
                </div>
            </div>
        );
    }

    return (
        <div className={wrapperClassName} style={wrapperStyle}>
            <div className="flex-1 flex flex-col divide-y divide-content3">
                <AnimatePresence initial={false} mode="popLayout">
                    {items.map((item) => (
                        <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, x: SWIPE_DISTANCE }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: SWIPE_DISTANCE }}
                            transition={ROW_TRANSITION}
                            className="flex-1 min-h-0"
                        >
                            {renderRow(item)}
                        </motion.div>
                    ))}
                </AnimatePresence>
                {Array.from({ length: Math.max(0, APPROVAL_ROWS_SIZE - items.length) }).map((_, index) => (
                    <div key={`empty-${index}`} className="flex-1 min-h-0" />
                ))}
            </div>
        </div>
    );
}

type ApprovalRowsProps = Omit<BaseElementProps, "children"> & {
    items: ICardSuggestion[];
    isLoading: boolean;
    emptyMessage: ReactNode;
    renderRow: (suggestion: ICardSuggestion) => ReactNode;
};
