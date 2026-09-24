import { useState } from "react";
import { ICardSuggestion, ReactionType, suggestionReactionBlockReason } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCheck,
    faEye,
    faEyeSlash,
    faThumbsDown,
    faThumbsUp,
    IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { Spinner } from "@heroui/react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { TouchTooltip } from "../../components/touchTooltip";
import ReactionCount from "../../components/reactionCount";
import SuggestionCardPreview from "../../components/suggestionCardPreview";
import { useAuth } from "../../hooks/useAuth";
import { useClearSuggestionReactionMutation, useReactToSuggestionMutation } from "../../api";
import useUser from "../../hooks/useUser";
import { showApiErrorToast } from "../../api/errors";

// Shared between every rail and the full grid - one card component, not two. The card is the whole
// link target, so a badge row needs both stopPropagation AND preventDefault to stop its own clicks.

// Badges stay rare - draft/approved are infrequent states worth a corner badge; Likes only earns one
// when the grid is actually sorted by Likes, mirroring ProjectContentCard's showReviewBadge.
const QUICK_REACT_OPTIONS: { type: ReactionType; label: string; hint: string; icon: IconDefinition }[] = [
    { type: "like", label: "Like", hint: "Support this suggestion", icon: faThumbsUp },
    { type: "dislike", label: "Dislike", hint: "Flag a problem with this suggestion", icon: faThumbsDown },
    { type: "ignore", label: "Ignore", hint: "Seen, no objection - won't ask again", icon: faEyeSlash }
];

// One statement of what each of the viewer's own reactions looks like as a badge. Ignore's icon is
// deliberately the OPEN eye, not the slashed one QUICK_REACT_OPTIONS uses - the opposite direction.
const MY_REACTION_BADGES: Record<ReactionType, { icon: IconDefinition; subtext: string; colorClass: string }> = {
    like: { icon: faThumbsUp, subtext: "Click to remove reaction", colorClass: "text-success" },
    dislike: { icon: faThumbsDown, subtext: "Click to remove reaction", colorClass: "text-danger" },
    ignore: { icon: faEye, subtext: "Click to un-ignore", colorClass: "text-primary" }
};

// "You liked this" alone once nobody else has, "You and N others liked this" once they have -
// Ignore stays a fixed "Ignored" (see MY_REACTION_BADGES' own comment above for why).
function reactionBadgeTitle(type: ReactionType, count: number): string {
    if (type === "ignore") {
        return "Ignored";
    }
    const verb = type === "like" ? "liked" : "disliked";
    const others = Math.max(count - 1, 0);
    return others > 0 ? `You and ${others} other${others === 1 ? "" : "s"} ${verb} this` : `You ${verb} this`;
}

const BADGE_FADE = { duration: 0.15 } as const;

// Crossfades between the resting icon and a spinner, rather than one replacing the other with a
// snap - a badge showing "processing" is a state change same as any other here.
function ReactionGlyph({
    icon,
    isPending,
    className
}: {
    icon: IconDefinition;
    isPending: boolean;
    className?: string;
}) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            {isPending ? (
                <motion.span
                    key="spinner"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={BADGE_FADE}
                    className="inline-flex"
                >
                    <Spinner size="sm" color="primary" />
                </motion.span>
            ) : (
                <motion.span
                    key="icon"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={BADGE_FADE}
                    className="inline-flex"
                >
                    <FontAwesomeIcon icon={icon} className={className} />
                </motion.span>
            )}
        </AnimatePresence>
    );
}

export default function SuggestionCard({ suggestion, showLikesBadge }: SuggestionCardProps) {
    const { user } = useAuth();
    const [reactToSuggestion] = useReactToSuggestionMutation();
    const [clearSuggestionReaction] = useClearSuggestionReactionMutation();
    // Tracks the reaction action in flight independently of the cache - `react`/`unreact` patch the
    // cache optimistically, which would otherwise flip row<->badge too fast to ever show a spinner.
    const [pending, setPending] = useState<{ type: ReactionType; mode: "react" | "clear" } | null>(null);

    const reactions = suggestion._metadata?.engagement?.reactions ?? {};
    const likeCount = Object.values(reactions).filter((entry) => entry.type === "like").length;
    const dislikeCount = Object.values(reactions).filter((entry) => entry.type === "dislike").length;
    const approvedBy = suggestion._metadata?.engagement?.approvedBy;
    const { user: approver } = useUser(approvedBy);
    const myReaction = user ? reactions[user.discordId]?.type : undefined;
    // Plots are landscape everywhere - the grid cell around this card (see suggestionCardLink.tsx)
    // is also sized for it, so both need to agree on the same isPlot check explicitly.
    const isPlot = suggestion.card.type === "plot";

    const canQuickReact = !!user && !suggestion.draft && !suggestionReactionBlockReason(suggestion, user.discordId);
    // Frozen for the whole pending duration rather than recomputed from `myReaction`, or the swap
    // would happen the instant the optimistic patch lands instead of when the request finishes.
    const reactionMode: "row" | "badge" | "none" = pending
        ? pending.mode === "clear"
            ? "badge"
            : "row"
        : myReaction
          ? "badge"
          : canQuickReact
            ? "row"
            : "none";
    const badgeReactionType = pending?.mode === "clear" ? pending.type : myReaction;

    const onQuickReact = async (reactType: ReactionType) => {
        if (!user) {
            return;
        }
        setPending({ type: reactType, mode: "react" });
        try {
            await reactToSuggestion({ id: suggestion.id!, reactType, discordId: user.discordId }).unwrap();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to React" });
        } finally {
            setPending(null);
        }
    };
    const onClearReaction = async () => {
        if (!user || !myReaction) {
            return;
        }
        setPending({ type: myReaction, mode: "clear" });
        try {
            await clearSuggestionReaction({ id: suggestion.id!, discordId: user.discordId }).unwrap();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to React" });
        } finally {
            setPending(null);
        }
    };

    return (
        <div className="relative">
            <div
                className="absolute top-0 right-0 m-2 z-10 flex items-center gap-1.5 transition-opacity duration-200 group-hover:opacity-50 hover:!opacity-100"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {approvedBy && (
                    <TouchTooltip
                        content={
                            <div className="max-w-64 px-1 py-0.5">
                                <div className="text-sm font-cinzel">
                                    <FontAwesomeIcon icon={faCheck} /> Approved
                                </div>
                                <div className="text-xs">by {approver?.displayname ?? "…"}</div>
                            </div>
                        }
                    >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70">
                            <FontAwesomeIcon icon={faCheck} className="text-lg text-success" />
                        </div>
                    </TouchTooltip>
                )}
                <AnimatePresence initial={false}>
                    {reactionMode === "badge" && badgeReactionType && (
                        <motion.div
                            key="reaction-badge"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={BADGE_FADE}
                        >
                            <TouchTooltip
                                content={
                                    <div className="max-w-64 px-1 py-0.5">
                                        <div className="text-sm font-cinzel">
                                            <FontAwesomeIcon icon={MY_REACTION_BADGES[badgeReactionType].icon} />{" "}
                                            {reactionBadgeTitle(
                                                badgeReactionType,
                                                badgeReactionType === "like" ? likeCount : dislikeCount
                                            )}
                                        </div>
                                        <div className="text-xs">{MY_REACTION_BADGES[badgeReactionType].subtext}</div>
                                    </div>
                                }
                            >
                                <button
                                    type="button"
                                    disabled={!!pending}
                                    onClick={onClearReaction}
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70 cursor-pointer disabled:cursor-default"
                                >
                                    <ReactionGlyph
                                        icon={MY_REACTION_BADGES[badgeReactionType].icon}
                                        isPending={pending?.mode === "clear"}
                                        className={classNames(
                                            "text-lg",
                                            MY_REACTION_BADGES[badgeReactionType].colorClass
                                        )}
                                    />
                                </button>
                            </TouchTooltip>
                        </motion.div>
                    )}
                </AnimatePresence>
                {showLikesBadge && (
                    <TouchTooltip
                        content={
                            <div className="px-1 py-0.5 text-sm font-cinzel">
                                {likeCount} like{likeCount !== 1 ? "s" : ""}
                            </div>
                        }
                    >
                        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70">
                            <FontAwesomeIcon icon={faThumbsUp} className="text-lg text-primary" />
                            <div className="absolute -bottom-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[0.65rem] leading-4 text-center font-bold">
                                <ReactionCount count={likeCount} />
                            </div>
                        </div>
                    </TouchTooltip>
                )}
            </div>
            {/* Quick-react - only offered while unreacted (an existing reaction has its own badge
                above). Hidden at rest, faded in on hover - the opposite of the always-visible badges. */}
            <AnimatePresence initial={false}>
                {reactionMode === "row" && (
                    // Two nested layers, not one - the outer motion.div's inline `animate` opacity
                    // would otherwise fight the inner Tailwind hover classes on the same element.
                    <motion.div
                        key="quick-react-row"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={BADGE_FADE}
                        className="absolute top-0 right-0 z-10"
                    >
                        <div
                            className="m-2 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-70"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            {QUICK_REACT_OPTIONS.map(({ type, label, hint, icon }) => {
                                const isThisPending = pending?.type === type && pending.mode === "react";
                                const isOtherPending = !!pending && !isThisPending;
                                return (
                                    <TouchTooltip
                                        key={type}
                                        content={
                                            <div className="max-w-64 px-1 py-0.5">
                                                <div className="text-sm font-cinzel">
                                                    <FontAwesomeIcon icon={icon} /> {label}
                                                </div>
                                                <div className="text-xs">{hint}</div>
                                            </div>
                                        }
                                    >
                                        <button
                                            type="button"
                                            disabled={isOtherPending}
                                            onClick={() => onQuickReact(type)}
                                            className={classNames(
                                                "flex items-center justify-center w-8 h-8 rounded-full bg-black/60 ring-1 ring-primary/70 transition-opacity duration-200 cursor-pointer disabled:cursor-default",
                                                isOtherPending ? "opacity-30" : "opacity-70 hover:!opacity-100"
                                            )}
                                        >
                                            <ReactionGlyph
                                                icon={icon}
                                                isPending={isThisPending}
                                                className="text-lg text-primary"
                                            />
                                        </button>
                                    </TouchTooltip>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <SuggestionCardPreview
                suggestion={suggestion}
                orientation={isPlot ? "horizontal" : "vertical"}
                rounded={true}
            />
        </div>
    );
}

type SuggestionCardProps = {
    suggestion: ICardSuggestion;
    showLikesBadge?: boolean;
};
