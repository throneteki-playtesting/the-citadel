import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ICardSuggestion, suggestionReactionBlockReason } from "common/models/cards";
import Permission from "common/models/permissions";
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faEyeSlash, faRightLeft } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@heroui/react";
import { useApproveSuggestionMutation, useGetSuggestionsQuery, useReactToSuggestionMutation } from "../../api";
import { showApiErrorToast } from "../../api/errors";
import { useAuth } from "../../hooks/useAuth";
import { usePermission } from "../../hooks/usePermission";
import { useSearchParamsScope } from "../../hooks/useSearchParamsScope";
import SectionTitle from "../../components/sectionTitle";
import SuggestionRow from "../../components/suggestionRow";
import { TouchTooltip } from "../../components/touchTooltip";
import SlidingPages from "../../components/slidingPages";
import ApprovalRows from "./approvalRows";

type Mode = "approved" | "awaiting";
const TITLE_FADE_TRANSITION = { duration: 0.15 } as const;

function countLikes(suggestion: ICardSuggestion) {
    return Object.values(suggestion._metadata?.engagement?.reactions ?? {}).filter((entry) => entry.type === "like")
        .length;
}

// Approve/Ignore for one Awaiting Approval row - its own component since each needs its own mutation
// hooks. Both patch the cache optimistically, so the row swipes out the moment this resolves locally.
function AwaitingApprovalActions({ suggestion }: { suggestion: ICardSuggestion }) {
    const { user } = useAuth();
    const [approveSuggestion] = useApproveSuggestionMutation();
    const [reactToSuggestion] = useReactToSuggestionMutation();

    const onApprove = async () => {
        if (!user) return;
        try {
            await approveSuggestion({ id: suggestion.id!, discordId: user.discordId }).unwrap();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Approve" });
        }
    };
    const onIgnore = async () => {
        if (!user) return;
        try {
            await reactToSuggestion({ id: suggestion.id!, reactType: "ignore", discordId: user.discordId }).unwrap();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Ignore" });
        }
    };

    // Ignore is a reaction, and a user can't react to their own suggestion (see
    // suggestionReactionBlockReason) - Approve isn't a reaction and stays available regardless.
    const canIgnore = !user || !suggestionReactionBlockReason(suggestion, user.discordId);

    return (
        <>
            <TouchTooltip content={<div className="px-1 py-0.5 text-sm font-cinzel">Approve</div>}>
                <Button isIconOnly size="sm" variant="flat" color="success" onPress={onApprove}>
                    <FontAwesomeIcon icon={faCheck} />
                </Button>
            </TouchTooltip>
            {canIgnore && (
                <TouchTooltip content={<div className="px-1 py-0.5 text-sm font-cinzel">Ignore</div>}>
                    <Button isIconOnly size="sm" variant="flat" onPress={onIgnore}>
                        <FontAwesomeIcon icon={faEyeSlash} />
                    </Button>
                </TouchTooltip>
            )}
        </>
    );
}

const TITLES: Record<Mode, string> = { approved: "Recently Approved", awaiting: "Awaiting Approval" };
const DESCRIPTIONS: Record<Mode, string> = {
    approved:
        "The latest suggestions the design team has signed off on, newest first — each row shows who " +
        "approved it, along with its current like and dislike counts.",
    awaiting:
        "Suggestions that have earned enough likes to be worth a decision, oldest first so nothing " +
        "waits too long. Approve to sign off, or Ignore to quietly clear it until it earns more support."
};

// Recently Approved, expanded: anyone without APPROVE_SUGGESTIONS sees no toggle at all. An approver
// gets a toggle to Awaiting Approval, each row with its own Approve/Ignore.
export default function SuggestionApprovalPanel({ className }: { className?: string }) {
    const canApprove = usePermission(Permission.APPROVE_SUGGESTIONS);
    const { user } = useAuth();

    // Seeded once from the url (?approval=awaiting); absent means "whatever the default is", which
    // the url scope below writes back out immediately - only ever as `approval=awaiting`, never "approved".
    const [searchParams] = useSearchParams();
    const [modeOverride, setModeOverride] = useState<Mode | undefined>(() =>
        searchParams.get("approval") === "awaiting" ? "awaiting" : undefined
    );
    const { data: suggestionsData, isLoading } = useGetSuggestionsQuery();
    const suggestions = useMemo(() => suggestionsData?.items ?? [], [suggestionsData?.items]);

    const approved = useMemo(() => {
        return suggestions
            .filter(
                (suggestion) =>
                    !!suggestion._metadata?.engagement?.approvedBy && !!suggestion._metadata?.engagement?.approvedAt
            )
            .sort(
                (a, b) =>
                    new Date(b._metadata!.engagement!.approvedAt!).getTime() -
                    new Date(a._metadata!.engagement!.approvedAt!).getTime()
            );
    }, [suggestions]);

    const awaiting = useMemo(() => {
        return suggestions
            .filter(
                (suggestion) =>
                    !suggestion.draft &&
                    !suggestion._metadata?.engagement?.approvedBy &&
                    countLikes(suggestion) >= SUGGESTION_APPROVAL_VOTE_THRESHOLD &&
                    suggestion._metadata?.engagement?.reactions?.[user?.discordId ?? ""]?.type !== "ignore"
            )
            .sort((a, b) => new Date(a.updated).getTime() - new Date(b.updated).getTime());
    }, [suggestions, user?.discordId]);

    // Awaiting Approval is only worth landing on by default while there's actually something in it -
    // an explicit toggle (modeOverride, including the url-seeded one above) always wins over this.
    const mode: Mode = canApprove ? (modeOverride ?? (awaiting.length > 0 ? "awaiting" : "approved")) : "approved";
    // Memoized, not an inline object literal - a fresh object every render re-fires the effect that
    // depends on it by reference, re-registering the scope in an infinite "update depth exceeded" loop.
    const scopeParams = useMemo(() => ({ approval: mode === "awaiting" ? "awaiting" : undefined }), [mode]);
    useSearchParamsScope("suggestion-approval", true, scopeParams);

    const renderRow = (mode: Mode) => (suggestion: ICardSuggestion) =>
        mode === "approved" ? (
            <SuggestionRow
                suggestion={suggestion}
                className="h-full"
                showInlineStatus
                showDislikes
                showPreview
                interactiveReactions
                showWatermarkStatusIcon={false}
            />
        ) : (
            <SuggestionRow
                suggestion={suggestion}
                className="h-full"
                showInlineStatus
                showDislikes
                showPreview
                interactiveReactions
                showWatermarkStatusIcon={false}
                actions={<AwaitingApprovalActions suggestion={suggestion} />}
            />
        );

    const approvedStat = (
        <div className="px-4 md:px-0 flex items-center gap-1.5 text-xs text-foreground/40">
            <span className="text-success tabular-nums font-semibold">{approved.length}</span>
            Total suggestions have been approved
        </div>
    );
    const awaitingStat = (
        <div className="px-4 md:px-0 flex items-center gap-1.5 text-xs text-foreground/40">
            <span className="text-warning tabular-nums font-semibold">{awaiting.length}</span>
            Total suggestions are awaiting approval
        </div>
    );

    return (
        <div className={className}>
            <div className="px-4 md:px-0 flex flex-col gap-0.5">
                {/* The toggle sits in the title's own line, matching Recent Suggestions' "See all" -
                    SectionTitle already ends in a flex-1 divider that fills the gap up to it. */}
                <div className="flex items-center gap-2">
                    <SectionTitle size="sm" indent="xs" className="flex-1 min-w-0">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={mode}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={TITLE_FADE_TRANSITION}
                                className="inline-block"
                            >
                                {TITLES[mode]}
                            </motion.span>
                        </AnimatePresence>
                    </SectionTitle>
                    {canApprove && (
                        // Plain clickable text, like "See all" for Recent Suggestions - icon-only
                        // below `sm`, icon-and-label from `sm` up.
                        <button
                            type="button"
                            onClick={() => setModeOverride(mode === "approved" ? "awaiting" : "approved")}
                            className="shrink-0 flex items-center gap-1 text-xs sm:text-sm text-primary cursor-pointer hover:brightness-125"
                        >
                            <FontAwesomeIcon icon={faRightLeft} />
                            <span className="hidden sm:inline whitespace-nowrap">
                                {mode === "approved" ? "Awaiting Approval" : "Recently Approved"}
                            </span>
                        </button>
                    )}
                </div>
                <div className="text-xs text-foreground/50 italic relative">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={mode}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={TITLE_FADE_TRANSITION}
                        >
                            {DESCRIPTIONS[mode]}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
            {/* `md:flex-1`, not plain `flex-1` - resolves to 0 height on mobile (every SlidingPages
                page is absolutely positioned, with nothing to grow into). */}
            {/* Neither ApprovalRows here gets `flex-1` either, same trap one level deeper - it
                collapsed its 5 fixed slots to 0 instead of showing them as blank rows. */}
            {canApprove ? (
                <SlidingPages currentPage={mode === "approved" ? 1 : 2} className="md:flex-1">
                    <div className="flex flex-col gap-2 h-full">
                        <ApprovalRows
                            items={approved.slice(0, 5)}
                            isLoading={isLoading}
                            emptyMessage="Nothing’s been approved yet — approved suggestions will show up here."
                            renderRow={renderRow("approved")}
                        />
                        {approvedStat}
                    </div>
                    <div className="flex flex-col gap-2 h-full">
                        <ApprovalRows
                            items={awaiting.slice(0, 5)}
                            isLoading={isLoading}
                            emptyMessage="Nothing’s waiting on a decision - suggestions past the like threshold will show up here."
                            renderRow={renderRow("awaiting")}
                        />
                        {awaitingStat}
                    </div>
                </SlidingPages>
            ) : (
                <div className="flex flex-col gap-2 flex-1">
                    <ApprovalRows
                        items={approved.slice(0, 5)}
                        isLoading={isLoading}
                        emptyMessage="Nothing’s been approved yet — approved suggestions will show up here."
                        renderRow={renderRow("approved")}
                    />
                    {approvedStat}
                </div>
            )}
        </div>
    );
}
