import { MouseEvent, useState } from "react";
import { ICardSuggestion, ReactionType, suggestionReactionBlockReason } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCheck,
    faClockRotateLeft,
    faEye,
    faEyeSlash,
    faThumbsDown,
    faThumbsUp,
    IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { PopoverContent } from "@heroui/react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { TouchTooltip } from "../../components/touchTooltip";
import { TouchPopover } from "../../components/touchPopover";
import CardCornerBadges, { CornerBadgeTooltip } from "../../components/cardCornerBadges";
import ReactionCount from "../../components/reactionCount";
import SuggestionCardPreview from "../../components/suggestionCardPreview";
import { useAuth } from "../../hooks/useAuth";
import { useCanHover } from "../../hooks/useCanHover";
import { useLongPress } from "../../hooks/useLongPress";
import { useClearSuggestionReactionMutation, useReactToSuggestionMutation } from "../../api";
import useUser from "../../hooks/useUser";
import { showApiErrorToast } from "../../api/errors";
import { hapticTap } from "../../utils";
import {
    cornerBadgeDiscFillClasses,
    cornerBadgeFadeClasses,
    LEGACY_SUGGESTION_DESCRIPTION,
    LONG_PRESS_MS
} from "../../constants";

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
const MY_REACTION_BADGES: Record<
    ReactionType,
    { icon: IconDefinition; subtext: string; colorClass: string; tintClass: string }
> = {
    like: {
        icon: faThumbsUp,
        subtext: "Click to remove reaction",
        colorClass: "text-success",
        tintClass: "bg-success/20"
    },
    dislike: {
        icon: faThumbsDown,
        subtext: "Click to remove reaction",
        colorClass: "text-danger",
        tintClass: "bg-danger/20"
    },
    ignore: { icon: faEye, subtext: "Click to un-ignore", colorClass: "text-primary", tintClass: "bg-primary/20" }
};

// A tap does nothing to a touch badge - the reaction is changed from the same bubble that set it
const TOUCH_REACTION_SUBTEXT = "Touch & hold to change";

const BADGE_FADE = { duration: 0.15 } as const;
const REACTION_FOLD = { duration: 0.2, ease: "easeOut" } as const;

// Sinks while held; the delay keeps a scroll's brief touch from flickering the press before it cancels
const HOLD_PRESS_CLASSES =
    "relative transition-transform duration-200 ease-out data-[holding=true]:scale-95 data-[holding=true]:delay-150 data-[holding=true]:duration-[350ms]";

type PendingReaction = { type: ReactionType; mode: "react" | "clear" } | null;

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

function isOtherPending(pending: PendingReaction, type: ReactionType) {
    return !!pending && pending.type !== type;
}

/** Touch's stand-in for the hover row - a card that can't be reacted to still answers the press, with why */
function ReactionBubble({ blockReason, myReaction, pending, onReact, onClear }: ReactionBubbleProps) {
    if (blockReason) {
        return <div className="px-3 py-1.5 text-sm text-foreground/70">{blockReason}</div>;
    }
    return (
        <div className="flex gap-1">
            {QUICK_REACT_OPTIONS.map(({ type, label, icon }) => {
                const isSelected = myReaction === type;
                return (
                    <button
                        key={type}
                        type="button"
                        disabled={!!pending}
                        onClick={() => (isSelected ? onClear() : onReact(type))}
                        className={classNames(
                            "flex items-center gap-2 h-10 px-3 rounded-full font-cinzel text-sm transition-[background-color,opacity] duration-200 cursor-pointer disabled:cursor-default",
                            isSelected
                                ? classNames(MY_REACTION_BADGES[type].tintClass, MY_REACTION_BADGES[type].colorClass)
                                : "active:bg-primary/25",
                            { "opacity-30": isOtherPending(pending, type) }
                        )}
                    >
                        <FontAwesomeIcon
                            icon={isSelected ? MY_REACTION_BADGES[type].icon : icon}
                            className={classNames(
                                "text-xl",
                                isSelected ? MY_REACTION_BADGES[type].colorClass : "text-primary"
                            )}
                        />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export default function SuggestionCard({ suggestion, showLikesBadge }: SuggestionCardProps) {
    const { user } = useAuth();
    const [reactToSuggestion] = useReactToSuggestionMutation();
    const [clearSuggestionReaction] = useClearSuggestionReactionMutation();
    // Tracks the reaction action in flight independently of the cache - `react`/`unreact` patch the
    // cache optimistically, which would otherwise flip row<->badge before the request has settled.
    const [pending, setPending] = useState<PendingReaction>(null);
    const [isBubbleOpen, setIsBubbleOpen] = useState(false);
    const canHover = useCanHover();
    const badgeLongPress = useLongPress(LONG_PRESS_MS);

    const reactions = suggestion._metadata?.engagement?.reactions ?? {};
    const likeCount = Object.values(reactions).filter((entry) => entry.type === "like").length;
    const dislikeCount = Object.values(reactions).filter((entry) => entry.type === "dislike").length;
    const approvedBy = suggestion._metadata?.engagement?.approvedBy;
    const { user: approver } = useUser(approvedBy);
    const myReaction = user ? reactions[user.discordId]?.type : undefined;
    // Plots are landscape everywhere - the grid cell around this card (see suggestionCardLink.tsx)
    // is also sized for it, so both need to agree on the same isPlot check explicitly.
    const isPlot = suggestion.card.type === "plot";

    const blockReason = user ? suggestionReactionBlockReason(suggestion, user.discordId) : undefined;
    const canQuickReact = !!user && !suggestion.draft && !blockReason;

    const onQuickReact = async (reactType: ReactionType) => {
        if (!user) {
            return;
        }
        setPending({ type: reactType, mode: "react" });
        try {
            await reactToSuggestion({ id: suggestion.id!, reactType, discordId: user.discordId }).unwrap();
            setIsBubbleOpen(false);
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
            setIsBubbleOpen(false);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to React" });
        } finally {
            setPending(null);
        }
    };

    // Hover holds the row or badge until the request settles, so the fold plays once; touch has no row to
    // fold from, so its badge follows the optimistic cache straight away
    const heldBadgeType = pending ? (pending.mode === "clear" ? pending.type : undefined) : myReaction;
    const shownBadgeType = canHover ? heldBadgeType : myReaction;
    const isBadge = !!shownBadgeType;
    // The row collapses into the badge - every option but the chosen one folds away
    const shownOptions = isBadge
        ? QUICK_REACT_OPTIONS.filter(({ type }) => type === shownBadgeType)
        : canHover && (!!pending || canQuickReact)
          ? QUICK_REACT_OPTIONS
          : [];

    const onOptionPress = (type: ReactionType) => {
        if (!isBadge) {
            onQuickReact(type);
        } else if (canHover) {
            onClearReaction();
        }
    };

    // Hover leaves opacity to the classes - an inline one would override the fades they drive
    const touchBadgeFade = !canHover && {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: BADGE_FADE
    };
    // Bound above the tooltip, so this capture runs first and the click ending a hold never opens it
    const touchBadgeHold = isBadge &&
        !canHover && {
            ...badgeLongPress.bind(() => {
                hapticTap();
                setIsBubbleOpen(true);
            }),
            onClickCapture: (e: MouseEvent) => {
                if (badgeLongPress.consumeLongPress()) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        };

    const cardContent = (
        <>
            <CardCornerBadges
                isolateClicks
                leading={
                    <AnimatePresence initial={false}>
                        {shownOptions.length > 0 && (
                            <motion.div
                                key="reactions"
                                {...touchBadgeFade}
                                className={classNames(
                                    "flex items-center p-0.5 rounded-full ring-1 ring-primary/70",
                                    cornerBadgeDiscFillClasses,
                                    isBadge
                                        ? cornerBadgeFadeClasses
                                        : "shadow-lg opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
                                )}
                            >
                                <AnimatePresence initial={false}>
                                    {shownOptions.map(({ type, label, hint, icon }) => (
                                        <motion.div
                                            key={type}
                                            initial={{ width: 0, opacity: 0 }}
                                            animate={{ width: "auto", opacity: 1 }}
                                            exit={{ width: 0, opacity: 0 }}
                                            transition={REACTION_FOLD}
                                            className="overflow-hidden"
                                            {...touchBadgeHold}
                                        >
                                            <TouchTooltip
                                                content={
                                                    isBadge ? (
                                                        <CornerBadgeTooltip
                                                            icon={MY_REACTION_BADGES[type].icon}
                                                            title={reactionBadgeTitle(
                                                                type,
                                                                type === "like" ? likeCount : dislikeCount
                                                            )}
                                                            description={
                                                                canHover
                                                                    ? MY_REACTION_BADGES[type].subtext
                                                                    : TOUCH_REACTION_SUBTEXT
                                                            }
                                                        />
                                                    ) : (
                                                        <CornerBadgeTooltip
                                                            icon={icon}
                                                            title={label}
                                                            description={hint}
                                                        />
                                                    )
                                                }
                                            >
                                                <button
                                                    type="button"
                                                    disabled={!!pending}
                                                    onClick={() => onOptionPress(type)}
                                                    className={classNames(
                                                        "flex items-center justify-center size-7 rounded-full transition-[background-color,opacity] duration-200 cursor-pointer disabled:cursor-default",
                                                        {
                                                            "opacity-30": isOtherPending(pending, type),
                                                            "hover:bg-primary/25 disabled:hover:bg-transparent":
                                                                !isBadge
                                                        }
                                                    )}
                                                >
                                                    <FontAwesomeIcon
                                                        icon={isBadge ? MY_REACTION_BADGES[type].icon : icon}
                                                        className={classNames(
                                                            "text-lg transition-colors duration-200",
                                                            isBadge
                                                                ? MY_REACTION_BADGES[type].colorClass
                                                                : "text-primary"
                                                        )}
                                                    />
                                                </button>
                                            </TouchTooltip>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                }
                badges={[
                    suggestion.legacy && {
                        key: "legacy",
                        icon: faClockRotateLeft,
                        title: "Legacy",
                        description: LEGACY_SUGGESTION_DESCRIPTION
                    },
                    !!approvedBy && {
                        key: "approved",
                        icon: faCheck,
                        iconClassName: "text-success",
                        title: "Approved",
                        description: `by ${approver?.displayname ?? "…"}`
                    },
                    showLikesBadge && {
                        key: "likes",
                        icon: faThumbsUp,
                        title: `${likeCount} like${likeCount !== 1 ? "s" : ""}`,
                        count: <ReactionCount count={likeCount} />
                    }
                ]}
            />
            <SuggestionCardPreview
                suggestion={suggestion}
                orientation={isPlot ? "horizontal" : "vertical"}
                rounded={true}
            />
        </>
    );

    return (
        <TouchPopover
            isDisabled={!user || !!suggestion.draft}
            isOpen={isBubbleOpen}
            onOpenChange={setIsBubbleOpen}
            placement="top"
            trigger={<div className={HOLD_PRESS_CLASSES}>{cardContent}</div>}
        >
            <PopoverContent className="p-1 rounded-full ring-1 ring-primary/70 shadow-lg bg-content3">
                <ReactionBubble
                    blockReason={blockReason}
                    myReaction={myReaction}
                    pending={pending}
                    onReact={onQuickReact}
                    onClear={onClearReaction}
                />
            </PopoverContent>
        </TouchPopover>
    );
}

type SuggestionCardProps = {
    suggestion: ICardSuggestion;
    showLikesBadge?: boolean;
};

type ReactionBubbleProps = {
    blockReason?: string;
    myReaction?: ReactionType;
    pending: PendingReaction;
    onReact: (type: ReactionType) => void;
    onClear: () => void;
};
