import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ICardSuggestion, ReactionType, suggestionReactionBlockReason } from "common/models/cards";
import Permission from "common/models/permissions";
import { renderCardSuggestion } from "common/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle, faCircleQuestion, faImage, faThumbsDown, faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import { Chip } from "@heroui/react";
import { CardPreview } from "@agot/card-preview";
import classNames from "classnames";
import { useGetUserQuery, useClearSuggestionReactionMutation, useReactToSuggestionMutation } from "../api";
import { showApiErrorToast } from "../api/errors";
import { useAuth } from "../hooks/useAuth";
import ThronesIcon from "./thronesIcon";
import Watermark from "./watermark";
import Timestamp from "./timestamp";
import PermissionedLink from "./permissionedLink";
import ReactionCount from "./reactionCount";
import { TouchTooltip } from "./touchTooltip";
import { watermarkClasses } from "../constants";

// A row's own link is the whole row, so a reaction toggle/Approve/Ignore has to actively cancel that
// navigation - capture-phase `preventDefault` alone does it, since Link checks `defaultPrevented`.
function preventRowNavigation(e: { preventDefault: () => void }) {
    e.preventDefault();
}

// Styled to actually read as a button - a filled pill with its own border, rather than the plain
// coloured text it used to be, which looked LESS interactive than the read-only Chip beside it.
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
            <ReactionCount count={count} />
        </button>
    );
}

// The read-only counterpart - plain text + icon with no border/fill, so it reads unmistakably as a
// passive stat rather than a button you happen not to be able to press.
function ReactionStat({ icon, count, className }: { icon: typeof faThumbsUp; count: number; className?: string }) {
    return (
        <span className={classNames("flex items-center gap-1 text-xs text-foreground/40", className)}>
            <FontAwesomeIcon icon={icon} />
            <ReactionCount count={count} />
        </span>
    );
}

// Shared between the home page's Recent Submissions rail and the suggestions dashboard's own rails -
// one row component, not one per caller. `className` lets a caller stretch rows to fill a taller list.
export default function SuggestionRow({
    suggestion,
    className,
    showInlineStatus,
    showWatermarkStatusIcon = true,
    showDislikes,
    interactiveReactions,
    showPreview,
    actions
}: SuggestionRowProps) {
    const { user } = useAuth();
    const approvedBy = suggestion._metadata?.engagement?.approvedBy;
    const isApproved = !!approvedBy;
    const reactions = suggestion._metadata?.engagement?.reactions ?? {};
    const likeCount = Object.values(reactions).filter((entry) => entry.type === "like").length;
    const dislikeCount = Object.values(reactions).filter((entry) => entry.type === "dislike").length;
    const myReaction = user ? reactions[user.discordId]?.type : undefined;
    // Interactive Like/Dislike is only offered on someone else's suggestion (see
    // suggestionReactionBlockReason) - own suggestions fall back to the same read-only counts.
    const canReact = !!user && !suggestionReactionBlockReason(suggestion, user.discordId);
    // Only fetched where the caller wants the approver's name (Recently Approved) - every other list
    // shows the plain "Approved" chip instead, no lookup needed.
    const skipApproverLookup = !showInlineStatus || !approvedBy;
    const { data: approver } = useGetUserQuery({ discordId: approvedBy as string }, { skip: skipApproverLookup });

    const [reactToSuggestion] = useReactToSuggestionMutation();
    const [clearSuggestionReaction] = useClearSuggestionReactionMutation();
    const onSetReaction = async (reactType: ReactionType) => {
        if (!user) return;
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
                <div className="relative ml-32">
                    <ThronesIcon
                        name={suggestion.card.faction}
                        className={classNames("text-7xl", watermarkClasses[suggestion.card.faction])}
                    />
                    {showWatermarkStatusIcon && (
                        <FontAwesomeIcon
                            icon={isApproved ? faCheckCircle : faCircleQuestion}
                            className="absolute right-0 bottom-0 text-2xl opacity-20"
                        />
                    )}
                </div>
            }
            containerClassName={classNames("relative bg-content1 hover:bg-content3", className)}
        >
            <PermissionedLink
                to={`/suggestions/${suggestion.id}`}
                requires={Permission.READ_SUGGESTIONS}
                className="h-full block"
            >
                <div className="relative z-10 h-full flex flex-col px-4 py-3">
                    <div className="grid grid-cols-[1fr_auto] gap-2 flex-1">
                        {/* Name and "Suggestion by" sit tight together at the top - the right column
                            below still spreads with `justify-between`, just not this one. */}
                        <div className="min-w-0 flex flex-col gap-0.5">
                            <div className="flex gap-2 flex-wrap items-center">
                                <div className="text-sm font-cinzel text-foreground truncate">
                                    <ThronesIcon name={suggestion.card.type} /> {suggestion.card.name}
                                </div>
                                {showPreview && (
                                    <TouchTooltip
                                        content={
                                            <div className="w-56">
                                                <CardPreview card={renderCardSuggestion(suggestion)} rounded />
                                            </div>
                                        }
                                    >
                                        <FontAwesomeIcon
                                            icon={faImage}
                                            className="text-foreground/40 hover:text-foreground/70 cursor-pointer shrink-0"
                                        />
                                    </TouchTooltip>
                                )}
                                {/* A Recently Approved/Awaiting Approval list already knows which it is,
                                    so a small tooltipped icon replaces the chip; a draft still gets one. */}
                                {showInlineStatus && !suggestion.draft ? (
                                    <TouchTooltip
                                        content={
                                            <div className="px-1 py-0.5 text-sm font-cinzel">
                                                {isApproved
                                                    ? `Approved by ${approver?.displayname ?? "…"}`
                                                    : "Awaiting Approval"}
                                            </div>
                                        }
                                    >
                                        <FontAwesomeIcon
                                            icon={isApproved ? faCheckCircle : faCircleQuestion}
                                            className={classNames(
                                                "cursor-help shrink-0",
                                                isApproved ? "text-success" : "text-warning"
                                            )}
                                        />
                                    </TouchTooltip>
                                ) : suggestion.draft ? (
                                    <Chip size="sm" color="default" variant="flat" className="shrink-0">
                                        Draft
                                    </Chip>
                                ) : isApproved ? (
                                    <Chip size="sm" color="success" variant="flat" className="shrink-0">
                                        Approved
                                    </Chip>
                                ) : (
                                    <Chip size="sm" color="default" variant="flat" className="shrink-0">
                                        Awaiting Approval
                                    </Chip>
                                )}
                            </div>
                            <div className="text-xs font-crimson italic text-foreground/40">
                                Suggestion by {suggestion.user.displayname}
                            </div>
                        </div>
                        <div
                            className="ml-auto flex flex-col items-end justify-between gap-1 shrink-0"
                            onClickCapture={preventRowNavigation}
                        >
                            <div className="flex items-center gap-2">
                                <Timestamp
                                    date={suggestion.updated}
                                    className="text-xs font-sans italic text-foreground/40"
                                />
                                {actions && <div className="flex items-center gap-1">{actions}</div>}
                            </div>
                            <div className="flex items-center gap-2">
                                {interactiveReactions && canReact ? (
                                    <>
                                        <ReactionToggle
                                            icon={faThumbsUp}
                                            count={likeCount}
                                            isActive={myReaction === "like"}
                                            activeClassName="bg-primary/20 text-primary"
                                            onPress={() => onSetReaction("like")}
                                        />
                                        {showDislikes && (
                                            <ReactionToggle
                                                icon={faThumbsDown}
                                                count={dislikeCount}
                                                isActive={myReaction === "dislike"}
                                                activeClassName="bg-danger/20 text-danger"
                                                onPress={() => onSetReaction("dislike")}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <ReactionStat icon={faThumbsUp} count={likeCount} />
                                        {showDislikes && <ReactionStat icon={faThumbsDown} count={dislikeCount} />}
                                    </>
                                )}
                            </div>
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
    /** Replaces the top Approved/Awaiting Approval chip with a small status icon - use only where
     * every row is already known to be one or the other. A draft still falls back to its own chip. */
    showInlineStatus?: boolean;
    /** The small check/question-mark glyph worked into the faction watermark - on by default, turned
     * off on the suggestions page's own rails where it reads as redundant clutter. */
    showWatermarkStatusIcon?: boolean;
    /** Adds a dislike count alongside the existing like count - opt-in since most lists (eg. Recent
     * Submissions) only ever cared about likes. */
    showDislikes?: boolean;
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
