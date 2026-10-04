import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EXPAND_MOTION } from "../constants";

/** Opens and closes its content by height, and only mounts it while open */
export default function Expand({ isOpen, className, children }: ExpandProps) {
    return (
        <AnimatePresence initial={false}>
            {isOpen && (
                <motion.div {...EXPAND_MOTION} className="overflow-hidden">
                    <div className={className}>{children}</div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

type ExpandProps = {
    isOpen: boolean;
    /** Applied inside the animated box, so padding is part of what opens rather than a jump at the end */
    className?: string;
    children: ReactNode;
};
