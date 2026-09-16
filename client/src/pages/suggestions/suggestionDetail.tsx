import { Navigate, useParams } from "react-router-dom";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    useApproveSuggestionMutation,
    useClearSuggestionReactionMutation,
    useDeleteSuggestionMutation,
    useGetSuggestionPlotMedianQuery,
    useGetSuggestionQuery,
    useGetUserQuery,
    useReactToSuggestionMutation,
    useRenderImageMutation,
    useUnapproveSuggestionMutation,
    useUnarchiveSuggestionMutation
} from "../../api";
import Permission from "common/models/permissions";
import { hasPermission, renderCardSuggestion } from "common/utils";
import { CardPreview } from "@agot/card-preview";
import {
    addToast,
    Button,
    ButtonGroup,
    Chip,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Spinner
} from "@heroui/react";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowsRotate,
    faAngleLeft,
    faCheckCircle,
    faCircleQuestion,
    faCoins,
    faCopy,
    faEyeSlash,
    faFileImage,
    faHandPointer,
    faHourglassEnd,
    faLink,
    faLock,
    faPencil,
    faPlus,
    faThumbsDown,
    faThumbsUp,
    faTrash,
    faTriangleExclamation,
    faXmarkCircle,
    IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import HeaderActions from "../../components/actions/headerActions";
import { statusActionItem } from "../../components/actions/statusActionItem";
import DiscordSuggestionStatus from "../../components/status/discordSuggestionStatus";
import { useDiscordSuggestionStatus } from "../../components/status/useDiscordSuggestionStatus";
import { usePermission } from "../../hooks/usePermission";
import { useAuth } from "../../hooks/useAuth";
import { User } from "common/models/auth";
import { showApiErrorToast } from "../../api/errors";
import { downloadBlob } from "../../utils";
import usePageTitle from "../../hooks/usePageTitle";
import EditSuggestionModal from "./editSuggestionModal";
import ConfirmModal from "../../components/confirmModal";
import { Code, ICardSuggestion, ILabeledCard, ReactionType, suggestionReactionBlockReason } from "common/models/cards";
import { DeepPartial } from "common/types";
import { checklistRules } from "common/designGuidelines/checklistRules";
import { SlimChecklistNotice } from "../../components/designGuidelines/suggestionChecklist";
import { REWARD_TYPES } from "common/designGuidelines/rewardTypes";
import { PUNISHMENT_TYPES } from "common/designGuidelines/punishmentTypes";
import { TRIGGER_RELIABILITIES, TriggerReliabilityIcon } from "common/designGuidelines/computeStrength";
import { REPEATABILITY_TILES } from "../../components/designGuidelines/repeatabilityTiles";
import { SUGGESTION_SECTION_DESCRIPTIONS } from "common/designGuidelines/sectionDescriptions";
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import PermissionedLink from "../../components/permissionedLink";
import SectionTitle from "../../components/sectionTitle";
import SectionBlurb from "../../components/sectionBlurb";
import { UserRow } from "../../components/userAvatar";
import Reveal from "../../components/reveal";
import Timestamp from "../../components/timestamp";
import ReactionCount from "../../components/reactionCount";
import { TouchTooltip } from "../../components/touchTooltip";
import StatusNotice from "../../components/statusNotice";
import { EASE_STANDARD } from "../../constants";
import { useSearchTDBCardsQuery } from "../../api/thronesdb";
import ArtworkFocus from "../../components/artwork/artworkFocus";

const REACTION_OPTIONS: { type: ReactionType; label: string; icon: typeof faThumbsUp }[] = [
    { type: "like", label: "Like", icon: faThumbsUp },
    { type: "dislike", label: "Dislike", icon: faThumbsDown },
    { type: "ignore", label: "Ignore", icon: faEyeSlash }
];

const RELIABILITY_ICONS: Record<TriggerReliabilityIcon, IconDefinition> = {
    recur: faArrowsRotate,
    pointer: faHandPointer,
    link: faLink
};

// Only the three repeatability toggles get a fixed icon map here - reward/punishment definitions
// carry no icon at all (see rewardTypes.ts/punishmentTypes.ts), so their own tile omits one.
const REPEATABILITY_ICON_OVERRIDE: Record<string, IconDefinition> = {
    oneTime: faHourglassEnd,
    hardLimit: faLock,
    paidCost: faCoins
};

// Pops once whenever this specific button becomes the active reaction - `initial={false}` skips
// the pop on first paint (already-active on load isn't an action), same feel as ReactionCount.
function ReactionIcon({ icon, isActive }: { icon: typeof faThumbsUp; isActive: boolean }) {
    return (
        <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
                key={isActive ? "active" : "inactive"}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.25 }}
                className="inline-flex"
            >
                <FontAwesomeIcon icon={icon} />
            </motion.span>
        </AnimatePresence>
    );
}

// Motion-enhanced so `layout` can smoothly resize the button - a plain HeroUI Button can't animate
// an "auto" width change via CSS alone.
const MotionButton = motion.create(Button);

/** Like/Dislike's own content - just the icon plus a count (never a text label, unlike Ignore, which
 *  stays as it was). No number at all while the count is 0, rather than a "0" nobody needs to read. */
function ReactionButtonContent({
    icon,
    isActive,
    count
}: {
    icon: typeof faThumbsUp;
    isActive: boolean;
    count: number;
}) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <ReactionIcon icon={icon} isActive={isActive} />
            {count > 0 && <ReactionCount count={count} />}
        </span>
    );
}

/** Who reacted a given way, for the Like/Dislike buttons' own tooltip - the hint line names exactly
 *  what pressing the button again would do, omitted entirely on your own suggestion. */
function ReactionTooltipContent({
    type,
    isActive,
    showHint,
    entries
}: {
    type: "like" | "dislike";
    isActive: boolean;
    showHint: boolean;
    entries: { discordId: string; reactedAt: string | Date }[];
}) {
    const newestFirst = [...entries].sort((a, b) => new Date(b.reactedAt).getTime() - new Date(a.reactedAt).getTime());
    const hint = isActive ? "Tap again to remove reaction" : `Tap again to ${type}`;
    return (
        <div className="flex flex-col gap-1.5 py-1 w-56 max-w-full">
            {showHint && <span className="text-xs text-foreground/50 italic">{hint}</span>}
            {newestFirst.map((entry) => (
                <UserRow key={entry.discordId} discordId={entry.discordId} />
            ))}
        </div>
    );
}

// The button's own width used to jump between "Approve" and "Unapprove" - an invisible copy of the
// longer label reserves the width permanently, and the real label crossfades over the top of it.
function ApproveButtonContent({ approved }: { approved: boolean }) {
    return (
        <span className="relative inline-flex items-center justify-center">
            <span className="invisible inline-flex items-center gap-2" aria-hidden="true">
                <FontAwesomeIcon icon={faXmarkCircle} />
                Unapprove
            </span>
            <AnimatePresence initial={false}>
                <motion.span
                    key={approved ? "unapprove" : "approve"}
                    className="absolute inset-0 inline-flex items-center justify-center gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <FontAwesomeIcon icon={approved ? faXmarkCircle : faCheckCircle} />
                    {approved ? "Unapprove" : "Approve"}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

/** One answer, read-only, styled like the editor's own answer tiles at rest - not something to
 *  highlight as if still an active choice. Reused for all four question types as one family. */
function AnswerTile({
    icon,
    label,
    description,
    example
}: {
    icon?: IconDefinition;
    label: string;
    description: string;
    example?: string;
}) {
    return (
        <div className="flex items-start gap-2 rounded-md border border-content3 bg-content1 p-2">
            {icon && <FontAwesomeIcon icon={icon} className="mt-0.5 shrink-0 text-foreground/50" />}
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground/90">{label}</span>
                <span className="text-xs text-foreground/60">{description}</span>
                {example && <span className="text-xs italic text-foreground/40">{example}</span>}
            </span>
        </div>
    );
}

// A vertical card's box is w-28 (7rem) at aspect-[240/333]. A plot is the same footprint transposed -
// as wide as a vertical card is tall, rather than reading squeezed/landscape-cramped.
const VERTICAL_CARD_WIDTH_REM = 7;
const PLOT_CARD_WIDTH_REM = (VERTICAL_CARD_WIDTH_REM * 333) / 240;

/** One printed ThronesDB card, at (roughly) its real shape - a plot stays landscape, transposed
 *  from the vertical card's own footprint. Hover/tap zoom + click-to-focus mirrors ArtworkFocus. */
function CardThumbnail({ card }: { card: ILabeledCard }) {
    const [origin, setOrigin] = useState<DOMRect>();
    const imgRef = useRef<HTMLImageElement | null>(null);
    const isPlot = card.type === "plot";
    const url = `https://thronesdb.com/card/${card.code}`;
    const focus = () => setOrigin(imgRef.current?.getBoundingClientRect());

    return (
        <>
            <motion.div
                className="relative shrink-0 cursor-zoom-in overflow-hidden rounded-md"
                style={{
                    width: `${isPlot ? PLOT_CARD_WIDTH_REM : VERTICAL_CARD_WIDTH_REM}rem`,
                    aspectRatio: isPlot ? "333/240" : "240/333"
                }}
                whileHover={{ scale: 0.97 }}
                whileTap={{ scale: 0.94 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                role="button"
                tabIndex={0}
                aria-label={`View ${card.label} up close`}
                onClick={focus}
                onKeyDown={(event: React.KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        focus();
                    }
                }}
            >
                <img
                    ref={imgRef}
                    src={card.imageUrl}
                    alt={card.label}
                    className="absolute inset-0 size-full object-contain"
                />
            </motion.div>
            <ArtworkFocus
                origin={origin}
                src={card.imageUrl}
                url={url}
                alt={card.label}
                linkLabel="View on ThronesDB"
                showSkeleton={false}
                onClose={() => setOrigin(undefined)}
            />
        </>
    );
}

/** A titled group of printed ThronesDB cards, resolved by code - shared by Comparable Cards and
 *  Combos With. Resolved by the parent (ComparableCombosSection), not fetched here - see that component. */
function CardCodesGroup({
    title,
    description,
    codes,
    cardsByCode,
    isLoading,
    fullWidth
}: {
    title: string;
    description: string;
    codes: string[];
    cardsByCode: Map<string, ILabeledCard>;
    /** While the ThronesDB lookup is in flight, nothing is drawn - not even the bare-code Chip
     *  fallback, reserved for a code that's genuinely unresolvable once the fetch has finished. */
    isLoading: boolean;
    /** Full-width stacked layout instead of sharing the row 50/50 with a sibling group - see
     *  ComparableCombosSection's own wrap-avoidance calculation. */
    fullWidth: boolean;
}) {
    return (
        <div className={classNames("flex flex-col gap-2", fullWidth ? "w-full" : "flex-1 min-w-0")}>
            <SectionTitle size="sm">{title}</SectionTitle>
            {/* Capped to keep the SIDE-BY-SIDE width from being driven by an unwrapped sentence - moot
                once stacked full-width, where the description fills it the same as the title does. */}
            <SectionBlurb className={fullWidth ? undefined : "max-w-80"}>{description}</SectionBlurb>
            {!isLoading && (
                <div className="flex flex-wrap gap-2">
                    {codes.map((code, index) => {
                        const card = cardsByCode.get(code);
                        return (
                            <motion.div
                                key={code}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: index * 0.03 }}
                            >
                                {card ? (
                                    <CardThumbnail card={card} />
                                ) : (
                                    <Chip size="sm" variant="flat">
                                        {code}
                                    </Chip>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Mirrors CardThumbnail's own fixed pixel widths so a group's one-row width can be computed directly
// from its cards' types, without measuring rendered cards - see ComparableCombosSection for why.
const CARD_GAP_PX = 0.5 * 16; // gap-2 between cards within a group
const GROUP_GAP_PX = 1 * 16; // gap-4 between the two groups when side by side

function groupRowWidthPx(codes: string[], cardsByCode: Map<string, ILabeledCard>): number {
    if (codes.length === 0) {
        return 0;
    }
    const total = codes.reduce((sum, code) => {
        const isPlot = cardsByCode.get(code)?.type === "plot";
        return sum + (isPlot ? PLOT_CARD_WIDTH_REM : VERTICAL_CARD_WIDTH_REM) * 16;
    }, 0);
    return total + (codes.length - 1) * CARD_GAP_PX;
}

/** Comparable Cards and Combos With sit side by side 50/50 only as long as BOTH fit - computed from
 *  fixed card widths, not by rendering and checking wrap (which would feed back on itself). */
function ComparableCombosSection({ comparableCards, combosWith }: { comparableCards: string[]; combosWith: string[] }) {
    const allCodes = useMemo(() => [...new Set([...comparableCards, ...combosWith])], [comparableCards, combosWith]);
    const { data, isLoading } = useSearchTDBCardsQuery(
        { filter: { code: { $in: allCodes as Code[] } }, page: 1, perPage: allCodes.length || 1 },
        { skip: allCodes.length === 0 }
    );
    const cardsByCode = useMemo(
        () =>
            new Map<string, ILabeledCard>(
                (data?.items ?? [])
                    .filter((card): card is ILabeledCard & { code: string } => !!card.code)
                    .map((card) => [card.code, card])
            ),
        [data]
    );

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        const measure = () => setContainerWidth(el.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    if (comparableCards.length === 0 && combosWith.length === 0) {
        return null;
    }

    const bothPresent = comparableCards.length > 0 && combosWith.length > 0;
    const halfWidth = (containerWidth - GROUP_GAP_PX) / 2;
    // "Side by side" only decides the flex direction; a lone group always gets the full row, same as
    // two groups that don't fit and end up stacked instead.
    const sideBySide =
        !bothPresent ||
        (groupRowWidthPx(comparableCards, cardsByCode) <= halfWidth &&
            groupRowWidthPx(combosWith, cardsByCode) <= halfWidth);
    const fullWidth = !bothPresent || !sideBySide;

    return (
        <div ref={containerRef} className="border border-content3 bg-content1 p-3">
            <div className={classNames("flex gap-4", sideBySide ? "flex-row" : "flex-col")}>
                {comparableCards.length > 0 && (
                    <CardCodesGroup
                        title="Comparable Cards"
                        description={SUGGESTION_SECTION_DESCRIPTIONS.comparableCards}
                        codes={comparableCards}
                        cardsByCode={cardsByCode}
                        isLoading={isLoading}
                        fullWidth={fullWidth}
                    />
                )}
                {combosWith.length > 0 && (
                    <CardCodesGroup
                        title="Combos With"
                        description={SUGGESTION_SECTION_DESCRIPTIONS.combosWith}
                        codes={combosWith}
                        cardsByCode={cardsByCode}
                        isLoading={isLoading}
                        fullWidth={fullWidth}
                    />
                )}
            </div>
        </div>
    );
}

const SuggestionDetail = () => {
    const params = useParams();
    const id = params.id;
    const { data: suggestion, isLoading } = useGetSuggestionQuery(id ?? "", { skip: !id });
    const [deleteSuggestion, { isLoading: isDeleting }] = useDeleteSuggestionMutation();
    const [renderImage, { isLoading: isRenderingImage }] = useRenderImageMutation();
    const [unarchiveSuggestion, { isLoading: isUnarchiving }] = useUnarchiveSuggestionMutation();
    const [reactToSuggestion] = useReactToSuggestionMutation();
    const [clearSuggestionReaction] = useClearSuggestionReactionMutation();
    const [approveSuggestion, { isLoading: isApproving }] = useApproveSuggestionMutation();
    const [unapproveSuggestion, { isLoading: isUnapproving }] = useUnapproveSuggestionMutation();
    const [editing, setEditing] = useState<DeepPartial<ICardSuggestion>>();
    const [isConfirmingApprove, setIsConfirmingApprove] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const { user } = useAuth();

    usePageTitle(suggestion ? `Suggestion - ${suggestion.card.name}` : "Suggestion");

    const canEdit = usePermission(
        (u: User) =>
            !!suggestion &&
            ((hasPermission(u, Permission.MAKE_SUGGESTIONS) && u.discordId === suggestion.user.discordId) ||
                hasPermission(u, Permission.EDIT_SUGGESTIONS))
    );
    const canDelete = usePermission(
        (u: User) =>
            !!suggestion &&
            ((hasPermission(u, Permission.MAKE_SUGGESTIONS) && u.discordId === suggestion.user.discordId) ||
                hasPermission(u, Permission.DELETE_SUGGESTIONS))
    );
    const canCreate = usePermission(Permission.MAKE_SUGGESTIONS);
    const canRenderCard = usePermission(Permission.RENDER_CARDS);
    const canManageArchive = usePermission(Permission.MANAGE_SUGGESTIONS_ARCHIVE);
    const canApprove = usePermission(Permission.APPROVE_SUGGESTIONS);

    const approvedBy = suggestion?._metadata?.engagement?.approvedBy;
    const { data: approver } = useGetUserQuery({ discordId: approvedBy as string }, { skip: !approvedBy });
    const { data: discordStatus } = useDiscordSuggestionStatus(id ?? "");
    // Only fetched for a plot - checklistRules() ignores it entirely for every other type.
    const { data: plotPoolMedian } = useGetSuggestionPlotMedianQuery(undefined, {
        skip: suggestion?.card.type !== "plot"
    });

    if (!id) {
        return <Navigate to="/suggestions" />;
    }

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!suggestion) {
        return <Navigate to="/suggestions" />;
    }

    if (suggestion.draft) {
        // The server only ever returns a draft here if it belongs to you (restrictDraftVisibility) -
        // a draft has no page of its own, so redirect back and open the editor instead.
        return <Navigate to="/suggestions" state={{ editDraft: suggestion }} replace />;
    }

    let sectionIndex = 0;

    const checklistResults = checklistRules({
        card: suggestion.card,
        questions: suggestion.questions,
        derived: suggestion.derived,
        pivotPoints: suggestion.pivotPoints,
        plotMedian: plotPoolMedian?.median
    });

    const onExportPNG = async () => {
        try {
            const blob = await renderImage(renderCardSuggestion(suggestion)).unwrap();
            downloadBlob(blob, `${suggestion.id}.png`);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Download" });
        }
    };
    const doDelete = async () => {
        try {
            await deleteSuggestion({ id: suggestion.id! }).unwrap();
            setIsConfirmingDelete(false);
            addToast({
                title: "Successfully deleted",
                color: "success",
                description: "Successfully deleted suggestion"
            });
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Delete" });
        }
    };
    const onUnarchive = async () => {
        try {
            await unarchiveSuggestion({ id: suggestion.id! }).unwrap();
            addToast({ title: "Unarchived", color: "success", description: "Suggestion is no longer archived" });
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Unarchive" });
        }
    };
    const reactions = suggestion._metadata?.engagement?.reactions ?? {};
    const myReaction = user ? reactions[user.discordId]?.type : undefined;
    const currentReactionOption = REACTION_OPTIONS.find((option) => option.type === myReaction);
    const reactionBlockReason = user ? suggestionReactionBlockReason(suggestion, user.discordId) : undefined;
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
    const likedBy = Object.entries(reactions)
        .filter(([, entry]) => entry.type === "like")
        .map(([discordId, entry]) => ({ discordId, reactedAt: entry.reactedAt }));
    const dislikedBy = Object.entries(reactions)
        .filter(([, entry]) => entry.type === "dislike")
        .map(([discordId, entry]) => ({ discordId, reactedAt: entry.reactedAt }));

    // Approving and unapproving are deliberately not one toggle - unapproving is a real removal, not
    // something a second press on the same badge should do by accident.
    const doApprove = async () => {
        if (!user) {
            return;
        }
        try {
            await approveSuggestion({ id: suggestion.id!, discordId: user.discordId }).unwrap();
            setIsConfirmingApprove(false);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Approve" });
        }
    };
    // Below the recommended vote threshold, approving is an override rather than confirming what the
    // votes already decided - worth a deliberate "are you sure" rather than a single accidental press.
    const onApprove = () => {
        if (likedBy.length < SUGGESTION_APPROVAL_VOTE_THRESHOLD) {
            setIsConfirmingApprove(true);
            return;
        }
        doApprove();
    };
    const onUnapprove = async () => {
        try {
            await unapproveSuggestion({ id: suggestion.id! }).unwrap();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Unapprove" });
        }
    };

    // Mirrors suggestionApprovalPanel.tsx's own `awaiting` filter (minus the draft check, since a
    // draft never reaches this page - see the redirect above).
    const isPendingDecision =
        canApprove && !approvedBy && likedBy.length >= SUGGESTION_APPROVAL_VOTE_THRESHOLD && myReaction !== "ignore";
    // Ignore is a reaction, and a user can't react to their own suggestion (see
    // suggestionReactionBlockReason) - an approver reviewing their own suggestion only gets Approve.
    const canIgnore = !reactionBlockReason;

    const rewardTiles = suggestion.questions.rewardTypes.map((id) => {
        const reward = REWARD_TYPES.find((r) => r.id === id);
        return <AnswerTile key={id} label={reward?.label ?? id} description={reward?.description ?? ""} />;
    });
    const punishmentTiles = suggestion.questions.punishment.map((id) => {
        const punishment = PUNISHMENT_TYPES.find((p) => p.id === id);
        return <AnswerTile key={id} label={punishment?.label ?? id} description={punishment?.description ?? ""} />;
    });
    const reliabilityTiles = suggestion.questions.triggerReliability.map((id) => {
        const reliability = TRIGGER_RELIABILITIES.find((r) => r.id === id);
        if (!reliability) {
            return null;
        }
        return (
            <AnswerTile
                key={id}
                icon={RELIABILITY_ICONS[reliability.icon]}
                label={reliability.label}
                description={reliability.description}
                example={reliability.example}
            />
        );
    });
    const repeatabilityTiles = REPEATABILITY_TILES.filter((tile) => suggestion.questions.repeatability[tile.key]).map(
        (tile) => (
            <AnswerTile
                key={tile.key}
                icon={REPEATABILITY_ICON_OVERRIDE[tile.key]}
                label={tile.label}
                description={tile.description}
                example={tile.example}
            />
        )
    );
    const hasReliability = reliabilityTiles.length > 0;
    const hasRepeatability = repeatabilityTiles.length > 0;

    // Bundled into HeaderActions' items - isDropdownOnly keeps it out of the desktop row entirely,
    // since desktop gets its own always-labelled standalone button instead (see below).
    const approveActionItem = canApprove && {
        key: approvedBy ? "unapprove" : "approve",
        title: approvedBy ? "Unapprove" : "Approve",
        icon: <FontAwesomeIcon icon={approvedBy ? faXmarkCircle : faCheckCircle} />,
        color: approvedBy ? ("danger" as const) : undefined,
        onPress: approvedBy ? onUnapprove : onApprove,
        isLoading: approvedBy ? isUnapproving : isApproving,
        isStatus: true,
        isDropdownOnly: true
    };

    return (
        <div className="flex flex-col gap-4">
            <Reveal index={sectionIndex++} className="px-2 md:px-0 flex flex-col sm:flex-row gap-3">
                <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
                    <PermissionedLink
                        to="/suggestions"
                        requires={Permission.READ_SUGGESTIONS}
                        className="order-1 text-base sm:text-xl tracking-widest text-secondary font-cinzel leading-tight hover:brightness-150 w-fit"
                    >
                        <FontAwesomeIcon icon={faAngleLeft} /> All Suggestions
                    </PermissionedLink>
                    {/* Approved is a permanent chip beside the name, not a full-width alert - stacked
                        below the name on mobile, beside it on desktop (sm:flex-row). */}
                    <div className="order-2 sm:basis-full flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <div className="text-xl sm:text-4xl tracking-wider font-cinzel font-semibold text-primary">
                            {suggestion.card.name}
                        </div>
                        {approvedBy && (
                            <TouchTooltip
                                content={
                                    <div className="px-1 py-0.5 text-sm font-cinzel">
                                        Approved by {approver?.displayname ?? "…"}
                                    </div>
                                }
                            >
                                <Chip
                                    size="sm"
                                    color="success"
                                    variant="flat"
                                    className="shrink-0 cursor-help"
                                    startContent={<FontAwesomeIcon icon={faCheckCircle} className="text-xs" />}
                                >
                                    Approved
                                </Chip>
                            </TouchTooltip>
                        )}
                    </div>
                    <div className="order-3 basis-full flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-foreground/50 shrink-0">Suggested by</span>
                            <UserRow discordId={suggestion.user.discordId} className="shrink-0 max-w-full" />
                        </div>
                        {/* The original submitter never changes server-side, so a later edit by
                            someone else is called out via `updatedBy`, the generic audit stamp. */}
                        {suggestion.updatedBy && suggestion.updatedBy !== suggestion.user.discordId && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-foreground/50 shrink-0">Edited by</span>
                                <UserRow discordId={suggestion.updatedBy} className="shrink-0 max-w-full" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions and reactions sit as one tight right-anchored cluster, reactions directly
                    underneath, rather than a separate full-width row further down the page. */}
                <div className="flex flex-col items-end gap-2 self-end sm:self-start">
                    <div className="flex items-center gap-2">
                        {/* Always a labelled button, not folded into HeaderActions' icon-only row -
                            worth reading at a glance. Mobile drops it for the "..." dropdown copy instead. */}
                        {canApprove && (
                            <Button
                                className="hidden sm:inline-flex"
                                color={approvedBy ? "danger" : "default"}
                                variant="flat"
                                isLoading={approvedBy ? isUnapproving : isApproving}
                                onPress={approvedBy ? onUnapprove : onApprove}
                            >
                                <ApproveButtonContent approved={!!approvedBy} />
                            </Button>
                        )}
                        <div className="hidden sm:flex items-center gap-1.5">
                            <DiscordSuggestionStatus id={suggestion.id!} isIconOnly />
                        </div>
                        <HeaderActions
                            items={[
                                approveActionItem,
                                statusActionItem("discord-status", discordStatus, { isDropdownOnly: true }),
                                canRenderCard && {
                                    key: "export-png",
                                    title: "Export PNG",
                                    icon: <FontAwesomeIcon icon={faFileImage} />,
                                    onPress: onExportPNG,
                                    isLoading: isRenderingImage
                                },
                                canCreate && {
                                    key: "copy",
                                    title: "Copy / Duplicate",
                                    icon: <FontAwesomeIcon icon={faCopy} />,
                                    onPress: () => setEditing({ card: suggestion.card })
                                },
                                canEdit && {
                                    key: "edit",
                                    title: "Edit",
                                    icon: <FontAwesomeIcon icon={faPencil} />,
                                    onPress: () => setEditing(suggestion)
                                },
                                suggestion.archived &&
                                    canManageArchive && {
                                        key: "unarchive",
                                        title: "Unarchive",
                                        icon: <FontAwesomeIcon icon={faTriangleExclamation} />,
                                        onPress: onUnarchive,
                                        isLoading: isUnarchiving
                                    },
                                canDelete && {
                                    key: "delete",
                                    title: "Delete",
                                    icon: <FontAwesomeIcon icon={faTrash} />,
                                    color: "danger",
                                    onPress: () => setIsConfirmingDelete(true),
                                    isLoading: isDeleting
                                }
                            ]}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Timestamp
                            date={suggestion.updated}
                            className="shrink-0 text-xs font-sans italic text-foreground/40"
                        />
                        {user && (
                            <ButtonGroup size="sm" className="hidden sm:flex">
                                {REACTION_OPTIONS.filter(({ type }) => type !== "ignore" || !reactionBlockReason).map(
                                    ({ type, label, icon }) => {
                                        const isActive = myReaction === type;
                                        const count =
                                            type === "like"
                                                ? likedBy.length
                                                : type === "dislike"
                                                  ? dislikedBy.length
                                                  : 0;
                                        // isDisabled is deliberately never used here - it adds
                                        // pointer-events-none, which would block the TouchTooltip too.
                                        const isBlocked = type !== "ignore" && !!reactionBlockReason;
                                        const button = (
                                            <MotionButton
                                                key={type}
                                                layout
                                                transition={{ duration: 0.2, ease: EASE_STANDARD }}
                                                variant={isActive ? "solid" : "flat"}
                                                color={isActive ? "primary" : "default"}
                                                disableRipple={isBlocked}
                                                className={classNames(
                                                    type !== "ignore" && "px-2",
                                                    // HeroUI's flat variant dims on hover regardless -
                                                    // pinned back to the resting opacity, `!` to win.
                                                    isBlocked &&
                                                        "opacity-disabled cursor-default data-[hover=true]:!opacity-disabled"
                                                )}
                                                onPress={() => !isBlocked && onSetReaction(type)}
                                            >
                                                {type === "ignore" ? (
                                                    <>
                                                        <ReactionIcon icon={icon} isActive={isActive} />
                                                        {label}
                                                    </>
                                                ) : (
                                                    <ReactionButtonContent
                                                        icon={icon}
                                                        isActive={isActive}
                                                        count={count}
                                                    />
                                                )}
                                            </MotionButton>
                                        );
                                        if (type === "ignore" || count === 0) {
                                            return button;
                                        }
                                        return (
                                            <TouchTooltip
                                                key={type}
                                                content={
                                                    <ReactionTooltipContent
                                                        type={type}
                                                        isActive={isActive}
                                                        showHint={!reactionBlockReason}
                                                        entries={type === "like" ? likedBy : dislikedBy}
                                                    />
                                                }
                                            >
                                                {button}
                                            </TouchTooltip>
                                        );
                                    }
                                )}
                            </ButtonGroup>
                        )}
                    </div>
                </div>
            </Reveal>

            {/* Draft flag - its own row, on every breakpoint. */}
            {suggestion.draft && (
                <div className="px-2 md:px-0">
                    <Chip size="sm" color="default" variant="flat">
                        Draft
                    </Chip>
                </div>
            )}

            {/* Mobile's stand-in for the reactions ButtonGroup above - a floating bubble opening the
                same three options as a dropdown. Absent entirely (not disabled) when reacting is blocked. */}
            {user && !reactionBlockReason && (
                <div className="sm:hidden fixed bottom-6 right-20 z-20">
                    <Dropdown placement="top-end">
                        <DropdownTrigger>
                            <Button
                                isIconOnly
                                radius="full"
                                size="lg"
                                color="primary"
                                className="shadow-lg"
                                aria-label="React to this suggestion"
                            >
                                {currentReactionOption ? (
                                    <FontAwesomeIcon icon={currentReactionOption.icon} />
                                ) : (
                                    <span className="relative inline-flex">
                                        <FontAwesomeIcon icon={faThumbsUp} />
                                        <span className="absolute -bottom-1.5 -right-1.5 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary-foreground text-primary text-[0.5rem]">
                                            <FontAwesomeIcon icon={faPlus} />
                                        </span>
                                    </span>
                                )}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="React to this suggestion"
                            onAction={(key) => onSetReaction(key as ReactionType)}
                        >
                            {REACTION_OPTIONS.map(({ type, label, icon }) => (
                                <DropdownItem
                                    key={type}
                                    startContent={<FontAwesomeIcon icon={icon} />}
                                    className={myReaction === type ? "text-primary" : undefined}
                                >
                                    {label}
                                </DropdownItem>
                            ))}
                        </DropdownMenu>
                    </Dropdown>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 px-2 lg:px-0">
                {/* No `gap` here (unlike most stacks in this file) - a flex `gap` doesn't collapse
                    smoothly as an animated notice exits, so each block owns its own margin instead. */}
                <Reveal
                    index={sectionIndex++}
                    className={classNames(
                        "w-full shrink-0 flex flex-col lg:sticky lg:top-4 lg:self-start",
                        // A plot's box is a portrait's box rotated - its width is what a portrait's
                        // height would be at the same base size, or it reads squashed into a
                        // portrait's narrower width footprint instead of its own landscape shape.
                        suggestion.card.type === "plot" ? "lg:w-[calc(18rem*333/240)]" : "lg:w-72"
                    )}
                >
                    <div
                        className={classNames(
                            "w-full mx-auto lg:mx-0 self-center lg:self-stretch",
                            suggestion.card.type === "plot"
                                ? "max-w-[calc(18rem*333/240)] aspect-[333/240]"
                                : "max-w-72 aspect-[240/333]"
                        )}
                    >
                        <CardPreview
                            card={renderCardSuggestion(suggestion)}
                            orientation={suggestion.card.type === "plot" ? "horizontal" : "vertical"}
                            rounded
                        />
                    </div>
                    {/* Mirrors artworkTab.tsx's own "Ready to sign off" notice - same shape, same
                        AnimatePresence. Only shown to someone who can act, never once they already have. */}
                    <AnimatePresence initial={false}>
                        {isPendingDecision && (
                            <motion.div
                                key="pending-decision"
                                className="overflow-hidden"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: EASE_STANDARD }}
                            >
                                <StatusNotice
                                    icon={faCircleQuestion}
                                    iconPosition="title"
                                    color="info"
                                    label="Ready for a Decision"
                                    detail={
                                        // Not StatusNotice's own `children` slot - that sits beside detail
                                        // text at `sm:` width, squeezing this fixed w-72 column to one word/line.
                                        <div className="flex flex-col gap-2">
                                            <span>
                                                This suggestion has earned enough likes to be worth a decision - approve
                                                to sign off
                                                {canIgnore &&
                                                    ", or ignore to quietly clear it until it earns more support"}
                                                .
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    color="success"
                                                    variant="flat"
                                                    isLoading={isApproving}
                                                    startContent={<FontAwesomeIcon icon={faCheckCircle} />}
                                                    onPress={onApprove}
                                                >
                                                    Approve
                                                </Button>
                                                {/* Can't react to your own suggestion - an approver
                                                    who's also the submitter only gets Approve. */}
                                                {canIgnore && (
                                                    <Button
                                                        size="sm"
                                                        variant="flat"
                                                        startContent={<FontAwesomeIcon icon={faEyeSlash} />}
                                                        onPress={() => onSetReaction("ignore")}
                                                    >
                                                        Ignore
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    }
                                    className="mt-3"
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <SlimChecklistNotice
                        results={checklistResults}
                        justifications={suggestion.checklistJustifications}
                        className="mt-3"
                    />
                </Reveal>

                <Reveal index={sectionIndex++} className="flex-1 min-w-0 flex flex-col gap-6">
                    {suggestion.notes && (
                        <div className="flex flex-col gap-2">
                            <SectionTitle size="sm">Editor Notes</SectionTitle>
                            <SectionBlurb>{SUGGESTION_SECTION_DESCRIPTIONS.editorNotes}</SectionBlurb>
                            <div className="text-sm text-foreground/70 whitespace-pre-wrap">{suggestion.notes}</div>
                        </div>
                    )}

                    {suggestion.archived && (
                        <div className="border border-warning/40 bg-warning/10 p-3 text-sm">
                            <div className="font-semibold">Archived - {suggestion.archived.reason}</div>
                            {suggestion.archived.details && (
                                <div className="text-xs mt-1">{suggestion.archived.details}</div>
                            )}
                            {suggestion.archived.project && (
                                <div className="text-xs mt-1">
                                    Used for {suggestion.archived.project.code} card #
                                    {suggestion.archived.project.number}
                                </div>
                            )}
                            <div className="text-xs mt-1 text-foreground/50">
                                Archived {new Date(suggestion.archived.archivedAt).toLocaleDateString()}
                                {suggestion.archived.archivedBy
                                    ? ` by ${suggestion.archived.archivedBy}`
                                    : " automatically"}
                            </div>
                        </div>
                    )}

                    {rewardTiles.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <SectionTitle size="sm">Reward Types</SectionTitle>
                            <SectionBlurb>{SUGGESTION_SECTION_DESCRIPTIONS.rewardTypes}</SectionBlurb>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{rewardTiles}</div>
                        </div>
                    )}

                    {punishmentTiles.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <SectionTitle size="sm">Punishment</SectionTitle>
                            <SectionBlurb>{SUGGESTION_SECTION_DESCRIPTIONS.punishment}</SectionBlurb>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{punishmentTiles}</div>
                        </div>
                    )}

                    {(hasReliability || hasRepeatability) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {hasReliability && (
                                <div className="flex flex-col gap-2">
                                    <SectionTitle size="sm">Trigger Reliability</SectionTitle>
                                    <SectionBlurb>{SUGGESTION_SECTION_DESCRIPTIONS.triggerReliability}</SectionBlurb>
                                    <div className="flex flex-col gap-2">{reliabilityTiles}</div>
                                </div>
                            )}
                            {hasRepeatability && (
                                <div className="flex flex-col gap-2">
                                    <SectionTitle size="sm">Trigger Repeatability</SectionTitle>
                                    <SectionBlurb>{SUGGESTION_SECTION_DESCRIPTIONS.triggerRepeatability}</SectionBlurb>
                                    <div className="flex flex-col gap-2">{repeatabilityTiles}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {suggestion.pivotPoints.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <SectionTitle size="sm">Pivot Points</SectionTitle>
                            <SectionBlurb>{SUGGESTION_SECTION_DESCRIPTIONS.pivotPoints}</SectionBlurb>
                            <div className="flex flex-col gap-2">
                                {suggestion.pivotPoints.map((point, index) => (
                                    <div
                                        key={index}
                                        className="rounded-md border border-content3 bg-content1 p-2.5 text-sm"
                                    >
                                        {point}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <ComparableCombosSection
                        comparableCards={suggestion.comparableCards}
                        combosWith={suggestion.combosWith}
                    />
                </Reveal>
            </div>

            <EditSuggestionModal
                isOpen={!!editing}
                suggestion={editing}
                onClose={() => setEditing(undefined)}
                onSave={() =>
                    addToast({
                        title: "Successfully saved",
                        color: "success",
                        description: "Suggestion has been saved"
                    })
                }
            />

            <ConfirmModal
                isOpen={isConfirmingApprove}
                isLoading={isApproving}
                confirmColor="primary"
                size="md"
                title="Approve this suggestion?"
                content={`It only has ${likedBy.length} like${likedBy.length === 1 ? "" : "s"} so far, below the recommended minimum of ${SUGGESTION_APPROVAL_VOTE_THRESHOLD}. Approve it anyway?`}
                confirmContent="Approve"
                onConfirm={doApprove}
                onClose={() => setIsConfirmingApprove(false)}
            />
            <ConfirmModal
                isOpen={isConfirmingDelete}
                isLoading={isDeleting}
                title="Delete this suggestion?"
                content="This is permanent and cannot be undone."
                confirmContent="Delete"
                onConfirm={doDelete}
                onClose={() => setIsConfirmingDelete(false)}
            />
        </div>
    );
};

export default SuggestionDetail;
