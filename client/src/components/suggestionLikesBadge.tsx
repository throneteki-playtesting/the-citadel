import { AnimatePresence, motion } from "framer-motion";
import { faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import { ICardSuggestion, countReactionsByType } from "common/models/cards";
import { cornerBadgeBottomRightClasses, NOTICE_TRANSITION } from "../constants";
import { CornerBadge } from "./cardCornerBadges";
import ReactionCount from "./reactionCount";

// How many likes a suggestion has, over its bottom-right corner while a list is sorted by them - fading in and out as
// the sort changes, as the project's sort-specific badges sit in the same corner
export default function SuggestionLikesBadge({ suggestion, isShown }: SuggestionLikesBadgeProps) {
    const likes = countReactionsByType(suggestion._metadata?.engagement?.reactions, "like");
    return (
        <AnimatePresence initial={false}>
            {isShown && (
                <motion.div
                    key="likes"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={NOTICE_TRANSITION}
                    className={cornerBadgeBottomRightClasses}
                >
                    <CornerBadge
                        icon={faThumbsUp}
                        title={`${likes} like${likes !== 1 ? "s" : ""}`}
                        count={<ReactionCount count={likes} />}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}

type SuggestionLikesBadgeProps = {
    suggestion: ICardSuggestion;
    isShown: boolean;
};
