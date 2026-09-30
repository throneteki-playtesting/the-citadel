import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ICardSuggestion, ReactionType, suggestionReactionBlockReason } from "common/models/cards";
import Permission from "common/models/permissions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImage, faThumbsDown, faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useClearSuggestionReactionMutation, useReactToSuggestionMutation } from "../api";
import { showApiErrorToast } from "../api/errors";
import { useAuth } from "../hooks/useAuth";
import ThronesIcon from "./thronesIcon";
import Watermark from "./watermark";
import Timestamp from "./timestamp";
import PermissionedLink from "./permissionedLink";
import ReactionCount from "./reactionCount";
import { TouchTooltip } from "./touchTooltip";
import SuggestionCardPreview from "./suggestionCardPreview";
import useUser from "../hooks/useUser";
import UserAvatar from "./userAvatar";
import { suggestionIcons, watermarkClasses } from "../constants";

// The whole row is a link, so its actions cancel navigation - Link checks `defaultPrevented`.
// Read-only content is left alone so a click on it still opens the suggestion.
function preventRowNavigation(e: { preventDefault: () => void }) {
    e.preventDefault();
}

// Styled to actually read as a button - a filled pill with its own border, so it can't be mistaken
// for the read-only ReactionStat.
function ReactionToggle({
    icon,
    count,
    isActive,
    activeClassName,
    onPress
}: {
    icon: typeof faThumbsUp;
    count: number;
    isActive: boolean;
    activeClassName: string;
    onPress: () => void;
}) {
    return (
        <button
            type="button"
            className={classNames(
                "flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors cursor-pointer",
                isActive
                    ? classNames(activeClassName, "border-transparent")
                    : "text-foreground/50 border-content3 bg-content2 hover:border-foreground/30 hover:text-foreground/80"
            )}
            onClick={(e) => {
                e.preventDefault();
                onPress();
            }}
        >
            <ReactionCount count={count} />
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    key={isActive ? "active" : "inactive"}
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex"
                >
                    <FontAwesomeIcon icon={icon} />
                </motion.span>
            </AnimatePresence>
        </button>
    );
}

// The read-only counterpart - plain text + icon with no border/fill, so it reads unmistakably as a
// passive stat rather than a button you happen not to be able to press.
function ReactionStat({ icon, count, className }: { icon: typeof faThumbsUp; count: number; className?: string }) {
    return (
        <span className={classNames("flex items-center gap-1 text-xs text-foreground/40", className)}>
            <ReactionCount count={count} />
            <FontAwesomeIcon icon={icon} />
        </span>
    );
}

// A suggestion's summary row, as listed in the home page's Recent Submissions.
export default function SuggestionRow({
    suggestion,
    className,
    interactiveReactions,
    showPreview,
    actions
}: SuggestionRowProps) {
    const { user } = useAuth();
    const isApproved = !!suggestion._metadata?.engagement?.approvedBy;
    const reactions = suggestion._metadata?.engagement?.reactions ?? {};
    const likeCount = Object.values(reactions).filter((entry) => entry.type === "like").length;
    const dislikeCount = Object.values(reactions).filter((entry) => entry.type === "dislike").length;
    const myReaction = user ? reactions[user.discordId]?.type : undefined;
    // Interactive Like/Dislike is only offered on someone else's suggestion (see
    // suggestionReactionBlockReason) - own suggestions fall back to the same read-only counts.
    const canReact = !!user && !suggestionReactionBlockReason(suggestion, user.discordId);
    const submitterName = useUser(suggestion.createdBy).user?.displayname;

    const [reactToSuggestion] = useReactToSuggestionMutation();
    const [clearSuggestionReaction] = useClearSuggestionReactionMutation();
    const onSetReaction = async (reactType: ReactionType) => {
        if (!user) {
            return;
        }
        try {
            if (myReaction === reactType) {
                await clearSuggestionReaction({ id: suggestion.id!, discordId: user.discordId }).unwrap();
            } else {
                await reactToSuggestion({ id: suggestion.id!, reactType, discordId: user.discordId }).unwrap();
            }
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to React" });
        }
    };

    return (
        <Watermark
            position="center"
            icon={
                <FontAwesomeIcon
                    icon={isApproved ? suggestionIcons.approved : suggestionIcons.awaiting}
                    className={classNames("ml-32 text-6xl", watermarkClasses[suggestion.card.faction])}
                />
            }
            containerClassName={classNames("relative bg-content1 hover:bg-content3", className)}
        >
            <PermissionedLink
                to={`/suggestions/${suggestion.id}`}
                requires={Permission.READ_SUGGESTIONS}
                className="h-full block"
            >
                <div className="relative z-10 h-full flex gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div className="flex gap-2 flex-wrap items-center">
                            <div className="text-base font-cinzel text-foreground truncate">
                                <ThronesIcon name={suggestion.card.type} /> {suggestion.card.name}
                            </div>
                            {showPreview && (
                                <TouchTooltip
                                    content={
                                        <div className="w-56">
                                            <SuggestionCardPreview suggestion={suggestion} rounded />
                                        </div>
                                    }
                                >
                                    <FontAwesomeIcon
                                        icon={faImage}
                                        className="text-foreground/40 hover:text-foreground/70 cursor-pointer shrink-0"
                                    />
                                </TouchTooltip>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0 text-xs font-crimson italic text-foreground/40">
                            <UserAvatar discordId={suggestion.createdBy} title={false} className="!size-4" />
                            <span className="truncate">Suggestion by {submitterName ?? "…"}</span>
                        </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end justify-between gap-1">
                        <div className="flex items-center gap-2">
                            <Timestamp
                                date={suggestion.updated}
                                className="text-xs font-sans italic text-foreground/40"
                            />
                            {actions && (
                                <div className="flex items-center gap-1" onClickCapture={preventRowNavigation}>
                                    {actions}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            {interactiveReactions && canReact ? (
                                <>
                                    <ReactionToggle
                                        icon={faThumbsUp}
                                        count={likeCount}
                                        isActive={myReaction === "like"}
                                        activeClassName="bg-primary/20 text-primary"
                                        onPress={() => onSetReaction("like")}
                                    />
                                    <ReactionToggle
                                        icon={faThumbsDown}
                                        count={dislikeCount}
                                        isActive={myReaction === "dislike"}
                                        activeClassName="bg-danger/20 text-danger"
                                        onPress={() => onSetReaction("dislike")}
                                    />
                                </>
                            ) : (
                                <>
                                    <ReactionStat icon={faThumbsUp} count={likeCount} />
                                    <ReactionStat icon={faThumbsDown} count={dislikeCount} />
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </PermissionedLink>
        </Watermark>
    );
}
type SuggestionRowProps = {
    suggestion: ICardSuggestion;
    className?: string;
    /** Turns the like/dislike counts into the current user's own pressable reaction toggles (same
     * react/clear mutations the suggestion detail page uses), instead of a read-only count. */
    interactiveReactions?: boolean;
    /** An eye icon next to the name whose touch tooltip shows the card's own rendered preview at
     * its natural orientation, rather than having to open the suggestion to see it. */
    showPreview?: boolean;
    /** Extra controls (eg. Approve/Ignore icon buttons), already wrapped to stop clicks reaching the
     * row's own link. */
    actions?: ReactNode;
};
