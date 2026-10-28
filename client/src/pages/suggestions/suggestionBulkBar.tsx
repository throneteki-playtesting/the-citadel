import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { addToast, Badge, Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCheckCircle,
    faChevronDown,
    faEllipsis,
    faEyeSlash,
    faRotateLeft,
    faThumbsDown,
    faThumbsUp,
    faTrashCan,
    faXmark,
    faXmarkCircle,
    IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { ICardSuggestion, ReactionType, SuggestionBulkAction } from "common/models/cards";
import Permission from "common/models/permissions";
import { pluralize, suggestionBulkBlockReason } from "common/utils";
import { useBulkSuggestionActionMutation } from "../../api";
import { showApiErrorToast } from "../../api/errors";
import ConfirmModal from "../../components/confirmModal";
import { TouchTooltip } from "../../components/touchTooltip";
import { usePermission } from "../../hooks/usePermission";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useScopedUser } from "../../hooks/useScopedUser";

type BulkOption = {
    key: string;
    action: SuggestionBulkAction;
    reactType?: ReactionType;
    label: string;
    /** What was done, for the toast - "Liked 4 suggestions" */
    done: string;
    icon: IconDefinition;
    color?: "primary" | "success" | "danger";
    /** Asks first - anything which can't simply be done again the other way by the same person */
    confirm?: { title: string; content: string; confirm: string };
    /** Folded into the "more" menu, being the undoing of something rather than a thing to do */
    isSecondary?: boolean;
    requires?: Permission;
};

const OPTIONS: BulkOption[] = [
    { key: "like", action: "react", reactType: "like", label: "Like", done: "Liked", icon: faThumbsUp },
    { key: "dislike", action: "react", reactType: "dislike", label: "Dislike", done: "Disliked", icon: faThumbsDown },
    { key: "ignore", action: "react", reactType: "ignore", label: "Ignore", done: "Ignored", icon: faEyeSlash },
    {
        key: "approve",
        action: "approve",
        label: "Approve",
        done: "Approved",
        icon: faCheckCircle,
        color: "success",
        requires: Permission.APPROVE_SUGGESTIONS,
        confirm: {
            title: "Approve these suggestions?",
            content: "Each is marked as approved by you, and its Discord thread says so.",
            confirm: "Approve"
        }
    },
    {
        key: "delete",
        action: "delete",
        label: "Delete",
        done: "Deleted",
        icon: faTrashCan,
        color: "danger",
        confirm: {
            title: "Delete these suggestions?",
            content: "This is permanent and cannot be undone.",
            confirm: "Delete"
        }
    },
    {
        key: "unreact",
        action: "unreact",
        label: "Clear my reaction",
        done: "Cleared your reaction on",
        icon: faRotateLeft,
        isSecondary: true
    },
    {
        key: "unapprove",
        action: "unapprove",
        label: "Remove approval",
        done: "Removed approval from",
        icon: faXmarkCircle,
        isSecondary: true,
        requires: Permission.APPROVE_SUGGESTIONS,
        confirm: {
            title: "Remove these approvals?",
            content: "Each loses its approval, and its Discord thread says so.",
            confirm: "Remove approval"
        }
    }
];

/** Why each of the selection would be left untouched, grouped by reason - shown before anything is asked of it */
function SkippedReasons({ skipped }: { skipped: { reason: string }[] }) {
    const byReason = new Map<string, number>();
    for (const { reason } of skipped) {
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    return (
        <ul className="flex flex-col gap-1 text-sm text-foreground/60">
            {[...byReason.entries()].map(([reason, count]) => (
                <li key={reason}>
                    {count} skipped - {reason.charAt(0).toLowerCase()}
                    {reason.slice(1)}
                </li>
            ))}
        </ul>
    );
}

// What can be done to the suggestions picked on the browse page, sticking beneath the navbar so it can't be missed.
// Each action says how many of the selection it applies to, by the same rule the server applies.
export default function SuggestionBulkBar({
    isSelecting,
    selected,
    shownCount,
    allShownSelected,
    onToggleAllShown,
    onClear,
    onExit,
    onDone
}: SuggestionBulkBarProps) {
    const isWide = useBreakpoint("md");
    const { user } = useScopedUser();
    const canApprove = usePermission(Permission.APPROVE_SUGGESTIONS);
    const [bulkAction, { isLoading }] = useBulkSuggestionActionMutation();
    const [confirming, setConfirming] = useState<BulkOption>();
    const [running, setRunning] = useState<string>();

    const options = OPTIONS.filter((option) => !option.requires || canApprove);
    const verdicts = (option: BulkOption) => {
        const applies: ICardSuggestion[] = [];
        const skipped: { reason: string }[] = [];
        for (const suggestion of selected) {
            const reason = suggestionBulkBlockReason(user, suggestion, option.action, option.reactType);
            if (reason) {
                skipped.push({ reason });
            } else {
                applies.push(suggestion);
            }
        }
        return { applies, skipped };
    };

    const run = async (option: BulkOption) => {
        const { applies } = verdicts(option);
        setRunning(option.key);
        try {
            const result = await bulkAction({
                action: option.action,
                reactType: option.reactType,
                ids: applies.map((suggestion) => suggestion.id!)
            }).unwrap();
            const count = result.succeeded.length;
            addToast({
                title: `${option.done} ${count} ${pluralize(count, "suggestion")}`,
                color: result.skipped.length > 0 ? "warning" : "success",
                description:
                    result.skipped.length > 0
                        ? `${result.skipped.length} skipped - ${result.skipped[0].reason.toLowerCase()}`
                        : undefined
            });
            setConfirming(undefined);
            onDone(option, result.succeeded);
        } catch (err) {
            showApiErrorToast(err, { title: `Failed to ${option.label.toLowerCase()}` });
        } finally {
            setRunning(undefined);
        }
    };

    const press = (option: BulkOption) => (option.confirm ? setConfirming(option) : run(option));

    const primary = options.filter((option) => !option.isSecondary);
    const secondary = options.filter((option) => option.isSecondary);
    const confirmingVerdicts = confirming && verdicts(confirming);

    const bar = (
        <AnimatePresence initial={false}>
            {isSelecting && (
                <motion.div
                    key="bulk-bar"
                    initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                    animate={{ height: "auto", opacity: 1, marginBottom: 8 }}
                    exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="sticky z-30 top-[calc(var(--nav-height)+0.5rem)] overflow-hidden rounded-xl"
                >
                    <div
                        className="flex items-center gap-1 sm:gap-2 rounded-xl border border-primary/40 bg-content1/95 backdrop-blur px-2 py-1.5 sm:px-3"
                        role="toolbar"
                        aria-label="Selected suggestions"
                    >
                        <Button isIconOnly size="sm" variant="light" aria-label="Stop selecting" onPress={onExit}>
                            <FontAwesomeIcon icon={faXmark} />
                        </Button>
                        <Dropdown placement="bottom-start">
                            <DropdownTrigger>
                                <Button
                                    size="sm"
                                    variant="light"
                                    className="tabular-nums"
                                    endContent={<FontAwesomeIcon icon={faChevronDown} className="text-xs" />}
                                >
                                    {selected.length}
                                    <span className="hidden sm:inline">{" selected"}</span>
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                                aria-label="Selection"
                                disabledKeys={[
                                    ...(shownCount === 0 ? ["all"] : []),
                                    ...(selected.length === 0 ? ["clear"] : [])
                                ]}
                                onAction={(key) => (key === "all" ? onToggleAllShown() : onClear())}
                            >
                                <DropdownItem key="all">
                                    {allShownSelected ? "Deselect all shown" : `Select all ${shownCount} shown`}
                                </DropdownItem>
                                <DropdownItem key="clear">Clear selection</DropdownItem>
                            </DropdownMenu>
                        </Dropdown>
                        <div className="ml-auto flex items-center gap-1 sm:gap-2">
                            {primary.map((option) => {
                                const count = verdicts(option).applies.length;
                                return (
                                    <TouchTooltip
                                        key={option.key}
                                        placement="bottom"
                                        content={`${option.label} ${count} of ${selected.length}`}
                                    >
                                        <div>
                                            <Badge
                                                content={count}
                                                size="sm"
                                                color={option.color ?? "primary"}
                                                isInvisible={count === 0 || count === selected.length}
                                                showOutline={false}
                                            >
                                                <Button
                                                    size="sm"
                                                    variant="flat"
                                                    color={option.color ?? "default"}
                                                    isDisabled={count === 0 || isLoading}
                                                    isLoading={running === option.key}
                                                    isIconOnly={!isWide}
                                                    aria-label={option.label}
                                                    startContent={<FontAwesomeIcon icon={option.icon} />}
                                                    onPress={() => press(option)}
                                                >
                                                    {isWide && option.label}
                                                </Button>
                                            </Badge>
                                        </div>
                                    </TouchTooltip>
                                );
                            })}
                            <Dropdown placement="bottom-end">
                                <DropdownTrigger>
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                        aria-label="More actions"
                                        isDisabled={isLoading || selected.length === 0}
                                    >
                                        <FontAwesomeIcon icon={faEllipsis} />
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label="More actions"
                                    disabledKeys={secondary
                                        .filter((option) => verdicts(option).applies.length === 0)
                                        .map((option) => option.key)}
                                    onAction={(key) => {
                                        const option = secondary.find((entry) => entry.key === key);
                                        if (option) {
                                            press(option);
                                        }
                                    }}
                                >
                                    {secondary.map((option) => (
                                        <DropdownItem
                                            key={option.key}
                                            startContent={<FontAwesomeIcon icon={option.icon} className="w-4" />}
                                            description={`Applies to ${verdicts(option).applies.length} of ${selected.length}`}
                                        >
                                            {option.label}
                                        </DropdownItem>
                                    ))}
                                </DropdownMenu>
                            </Dropdown>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <>
            {bar}
            <ConfirmModal
                isOpen={!!confirming}
                isLoading={isLoading}
                confirmColor={confirming?.color === "danger" ? "danger" : "primary"}
                size="md"
                title={confirming?.confirm?.title ?? ""}
                content={
                    confirming &&
                    confirmingVerdicts && (
                        <div className="flex flex-col gap-2">
                            <span>
                                {confirming.label} {confirmingVerdicts.applies.length}{" "}
                                {pluralize(confirmingVerdicts.applies.length, "suggestion")}?{" "}
                                {confirming.confirm?.content}
                            </span>
                            {confirmingVerdicts.skipped.length > 0 && (
                                <SkippedReasons skipped={confirmingVerdicts.skipped} />
                            )}
                        </div>
                    )
                }
                confirmContent={
                    confirming && confirmingVerdicts
                        ? `${confirming.confirm?.confirm} ${confirmingVerdicts.applies.length}`
                        : ""
                }
                onConfirm={() => confirming && run(confirming)}
                onClose={() => setConfirming(undefined)}
            />
        </>
    );
}

type SuggestionBulkBarProps = {
    isSelecting: boolean;
    selected: ICardSuggestion[];
    /** How many suggestions the grid has loaded, for selecting them all */
    shownCount: number;
    allShownSelected: boolean;
    onToggleAllShown: () => void;
    onClear: () => void;
    onExit: () => void;
    /** Told what was done to which - a deletion drops them from the selection, since they are gone */
    onDone: (option: { action: SuggestionBulkAction; reactType?: ReactionType }, ids: string[]) => void;
};
