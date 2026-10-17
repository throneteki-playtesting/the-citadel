import { ReactNode } from "react";
import { motion } from "framer-motion";

const SECTION_TRANSITION = { duration: 0.25 } as const;
const DISTANCE = 8;

export type RevealDirection = "up" | "down" | "left" | "right" | null;

// The side it travels FROM, not the side it moves toward - "up" settles upward into place, so it
// starts below (a positive y offset) and animates back to 0.
const START_OFFSET: Record<Exclude<RevealDirection, null>, { x?: number; y?: number }> = {
    up: { y: DISTANCE },
    down: { y: -DISTANCE },
    left: { x: DISTANCE },
    right: { x: -DISTANCE }
};

/** The site's one "page section just arrived" animation - fade in, settle a few pixels into place from
 *  `direction` (null for a plain fade, no movement). `index` staggers a run of these by 50ms each;
 *  leave it unset for a lone section. */
export default function Reveal({
    children,
    index = 0,
    direction = "up",
    className
}: {
    children: ReactNode;
    index?: number;
    direction?: RevealDirection;
    className?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, ...(direction && START_OFFSET[direction]) }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ ...SECTION_TRANSITION, delay: index * 0.05 }}
            className={className}
        >
            {children}
        </motion.div>
    );
}
