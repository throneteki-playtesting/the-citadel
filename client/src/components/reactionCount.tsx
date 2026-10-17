import { AnimatePresence, motion } from "framer-motion";

// A changing number pops in/out rather than snapping - used everywhere a live reaction count is
// shown, so a count arriving live via SSE reads the same familiar "message app" way everywhere.
export default function ReactionCount({ count, className }: ReactionCountProps) {
    return (
        <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
                key={count}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={className}
            >
                {count}
            </motion.span>
        </AnimatePresence>
    );
}
type ReactionCountProps = {
    count: number;
    className?: string;
};
