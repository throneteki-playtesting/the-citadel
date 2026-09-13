import { ReactNode } from "react";
import { motion } from "framer-motion";

const SECTION_TRANSITION = { duration: 0.25 } as const;

/** The site's one "page section just arrived" animation - fade in, settle down a few pixels. `index`
 *  staggers a run of these by 50ms each; leave it unset for a lone section. */
export default function Reveal({
    children,
    index = 0,
    className
}: {
    children: ReactNode;
    index?: number;
    className?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SECTION_TRANSITION, delay: index * 0.05 }}
            className={className}
        >
            {children}
        </motion.div>
    );
}
