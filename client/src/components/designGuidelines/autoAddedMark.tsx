import { memo } from "react";
import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { TouchTooltip } from "../touchTooltip";
import { useReducedMotion } from "../../hooks/useReducedMotion";

// Marks a selection made by the card text, not the designer. Twinkles briefly, then settles; the tooltip names the keywords.
const AutoAddedMark = memo(function AutoAddedMark({ keywords }: { keywords: string[] }) {
    const reduceMotion = useReducedMotion();
    return (
        <TouchTooltip content={`Added because of ${keywords.join(", ")}`} placement="top" size="sm">
            <motion.span
                aria-label={`Added because of ${keywords.join(", ")}`}
                role="img"
                className="inline-flex text-xs text-warning"
                animate={reduceMotion ? undefined : { scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.7, repeat: 2, ease: "easeInOut" }}
            >
                <FontAwesomeIcon icon={faWandMagicSparkles} />
            </motion.span>
        </TouchTooltip>
    );
});

export default AutoAddedMark;
