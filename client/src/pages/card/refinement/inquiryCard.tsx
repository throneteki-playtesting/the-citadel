import { ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faCheck,
    faChevronRight,
    faEllipsisVertical,
    faPencil,
    faRotateLeft,
    faTrash,
    faTriangleExclamation
} from "@fortawesome/free-solid-svg-icons";
import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import classNames from "classnames";
import {
    IRefinementInquiry,
    isInquiryAddressed,
    isInquiryOpen,
    isInquiryStale,
    isVersionWithdrawn
} from "common/models/refinement";
import { SemanticVersion } from "common/utils";
import { EASE_STANDARD, highlightTarget, inquirySeverityMeta } from "../../../constants";
import { HighlightTarget } from "../../../components/highlightTarget";
import RichText from "../../../components/richText";
import { TouchTooltip } from "../../../components/touchTooltip";
import TooltipDetail from "../../../components/tooltipDetail";
import { UserRow } from "../../../components/userAvatar";
import Timestamp from "../../../components/timestamp";
import { useStartInquiryDiscussionMutation } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";
import DiscordLinkButton from "../../../components/discordLinkButton";
import { openDiscordLink, useDiscordTarget } from "../../../hooks/useDiscordLink";
import { SeverityBadge } from "../../../components/refinement/severitySelect";

const COLLAPSED_HEIGHT = "8rem";
const FOLD_TRANSITION = { duration: 0.25, ease: EASE_STANDARD } as const;

// An equal share of the phone-width row, its own width from `md` up
const ACTION_CLASS = "flex-1 md:flex-none md:shrink-0";

/**
 * One mark in an inquiry's title row saying where it stands. The label is dropped below `md` and only
 * the icon kept, since the tooltip carries the whole account either way.
 */
function TitleChip({ color, icon, label, heading, children }: TitleChipProps) {
    return (
        <TouchTooltip content={<TooltipDetail heading={heading}>{children}</TooltipDetail>}>
            <Chip
                size="sm"
                variant="flat"
                color={color}
                classNames={{
                    // Squared off to its own height, so an icon alone reads as a circle. `max-w-none`
                    // undoes the chip's own `max-w-fit`, which would cap it at the icon's width
                    base: "w-6 max-w-none shrink-0 cursor-help justify-center px-0 tabular-nums md:w-auto md:max-w-fit md:px-1",
                    content: "px-0 md:px-1"
                }}
            >
                <span className="flex items-center justify-center gap-1">
                    <FontAwesomeIcon icon={icon} />
                    <span className="hidden md:inline">{label}</span>
                </span>
            </Chip>
        </TouchTooltip>
    );
}

type TitleChipProps = {
    color: "warning" | "success";
    icon: IconDefinition;
    /** Short enough to sit beside a summary - a version where there is one worth naming */
    label: string;
    heading: string;
    children: ReactNode;
};

/**
 * The green tick a settled inquiry carries, and the whole account of how it was settled - who, when, the
 * update and reason where given. A hover rather than a section of its own, with just one mark added.
 */
function ResolvedMark({ inquiry }: { inquiry: IRefinementInquiry }) {
    if (!inquiry.resolution) {
        return null;
    }

    return (
        <TouchTooltip
            content={
                <div className="flex max-w-72 flex-col gap-1.5 py-0.5">
                    <span className="flex items-start gap-3 text-xs text-foreground/60">
                        <span className="flex flex-1 flex-wrap items-center gap-1.5">
                            Resolved by <UserRow discordId={inquiry.resolution.by} />
                        </span>
                        <span className="shrink-0 text-foreground/40">
                            <Timestamp date={inquiry.resolution.at} />
                        </span>
                    </span>
                    {inquiry.addressedIn && (
                        <Chip
                            size="sm"
                            variant="flat"
                            color="success"
                            className="self-start gap-1 tabular-nums"
                            startContent={<FontAwesomeIcon icon={faCheck} className="ml-1.5" />}
                        >
                            Addressed in {inquiry.addressedIn}
                        </Chip>
                    )}
                    {inquiry.resolution.note && (
                        <div className="text-xs text-foreground/80">
                            <RichText html={inquiry.resolution.note} />
                        </div>
                    )}
                </div>
            }
        >
            <span className="flex size-8 shrink-0 cursor-help items-center justify-center text-xl text-success">
                <FontAwesomeIcon icon={faCircleCheck} />
            </span>
        </TouchTooltip>
    );
}

/**
 * What can be done to an open inquiry from its title - both buttons where there is room, and the same two
 * folded into a `...` menu below `md`, as the release blocks do.
 */
function TitleActions({ canEdit, canDelete, isDisabled, onEdit, onDelete }: TitleActionsProps) {
    if (!canEdit && !canDelete) {
        return null;
    }

    return (
        // The header folds the inquiry when pressed, so nothing in here may reach it
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Dropdown>
                <DropdownTrigger>
                    <Button
                        isIconOnly
                        size="sm"
                        variant="solid"
                        aria-label="Inquiry actions"
                        className="md:hidden"
                        isDisabled={isDisabled}
                    >
                        <FontAwesomeIcon icon={faEllipsisVertical} />
                    </Button>
                </DropdownTrigger>
                <DropdownMenu
                    aria-label="Inquiry actions"
                    onAction={(key) => {
                        if (key === "edit") {
                            onEdit();
                        } else {
                            onDelete();
                        }
                    }}
                >
                    {[
                        ...(canEdit
                            ? [
                                  <DropdownItem key="edit" startContent={<FontAwesomeIcon icon={faPencil} />}>
                                      Edit
                                  </DropdownItem>
                              ]
                            : []),
                        ...(canDelete
                            ? [
                                  <DropdownItem
                                      key="delete"
                                      color="danger"
                                      startContent={<FontAwesomeIcon icon={faTrash} />}
                                  >
                                      Delete
                                  </DropdownItem>
                              ]
                            : [])
                    ]}
                </DropdownMenu>
            </Dropdown>
            <div className="hidden items-center gap-1 md:flex">
                {canEdit && (
                    <Button
                        isIconOnly
                        size="sm"
                        variant="solid"
                        aria-label="Edit inquiry"
                        isDisabled={isDisabled}
                        onPress={onEdit}
                    >
                        <FontAwesomeIcon icon={faPencil} />
                    </Button>
                )}
                {canDelete && (
                    <Button
                        isIconOnly
                        size="sm"
                        variant="solid"
                        color="danger"
                        aria-label="Delete inquiry"
                        isDisabled={isDisabled}
                        onPress={onDelete}
                    >
                        <FontAwesomeIcon icon={faTrash} />
                    </Button>
                )}
            </div>
        </div>
    );
}

type TitleActionsProps = {
    canEdit: boolean;
    canDelete: boolean;
    isDisabled: boolean;
    onEdit: () => void;
    onDelete: () => void;
};

/**
 * The way to Discord, and back from it: one button which offers to open a thread until there is one, then
 * opens it. Opt-in, since a forum handed a thread for every inquiry is a forum nobody reads.
 */
function DiscussionButton({ project, number, inquiry, canStart, isDisabled, className }: DiscussionButtonProps) {
    const [startDiscussion, { isLoading }] = useStartInquiryDiscussionMutation();
    const [isOpening, setIsOpening] = useState(false);
    const target = useDiscordTarget();
    const threadUrl = inquiry._metadata?.discord?.threadUrl;

    if (threadUrl) {
        return (
            <DiscordLinkButton url={threadUrl} className={className}>
                Discussion
            </DiscordLinkButton>
        );
    }

    if (!canStart) {
        return null;
    }

    const onStart = async () => {
        // Held past the mutation, since the request finishing is not the end of the errand. Only failing
        // puts it back - success ends with this button replaced by the one which opens the thread
        setIsOpening(true);
        try {
            // The thread is what was asked for, so the page follows the person to it
            const result = await startDiscussion({ project, number, inquiry: inquiry.inquiry }).unwrap();
            const opened = result.inquiries.find((entry) => entry.inquiry === inquiry.inquiry);
            if (opened?._metadata?.discord?.threadUrl) {
                openDiscordLink(opened._metadata.discord.threadUrl, target);
            }
        } catch (err) {
            setIsOpening(false);
            showApiErrorToast(err, { title: "Failed to start a discussion" });
        }
    };

    return (
        <Button
            size="sm"
            variant="flat"
            className={className}
            isLoading={isLoading || isOpening}
            isDisabled={isDisabled}
            startContent={
                isLoading || isOpening ? undefined : <FontAwesomeIcon icon={faDiscord} className="text-base" />
            }
            onPress={onStart}
        >
            Start Discussion
        </Button>
    );
}

type DiscussionButtonProps = {
    project: number;
    number: number;
    inquiry: IRefinementInquiry;
    canStart: boolean;
    isDisabled: boolean;
    className?: string;
};

/** One inquiry in full: what was raised, by whom, against which card, and where it stands */
export default function InquiryCard({
    project,
    number,
    inquiry,
    version,
    canEdit,
    canDelete,
    canResolve,
    canStartDiscussion,
    isSaving,
    isHighlighted,
    onEdit,
    onDelete,
    onResolve,
    onReopen
}: InquiryCardProps) {
    const meta = inquirySeverityMeta[inquiry.severity];
    const isOpen = isInquiryOpen(inquiry);
    const isStale = isInquiryStale(inquiry, version);
    const isAddressed = isInquiryAddressed(inquiry);
    // The version it names is gone rather than merely superseded, which reads differently: nothing about
    // the card moved on, the card it was written against was withdrawn
    const isOutdated = isVersionWithdrawn(inquiry.version, version);
    const isFixWithdrawn = !isOpen && isVersionWithdrawn(inquiry.addressedIn, version);
    const hasBody = !!inquiry.detail;
    const hasTitleControls = isStale || isAddressed || isFixWithdrawn || (isOpen && (canEdit || canDelete));

    // Folded by default so a card's whole list of inquiries is one screen to skim. The exception is one
    // somebody has just been sent to - arriving at an inquiry folded away answers nothing
    const [isFolded, setIsFolded] = useState(!isHighlighted);
    useEffect(() => {
        if (isHighlighted) {
            setIsFolded(false);
        }
    }, [isHighlighted]);

    // Long detail is capped rather than allowed to push everything below it off the screen, the same way
    // a review's additional comments are
    const bodyRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    useEffect(() => {
        if (bodyRef.current) {
            setIsOverflowing(bodyRef.current.scrollHeight > bodyRef.current.clientHeight);
        }
    }, [inquiry.detail, isFolded]);

    return (
        <HighlightTarget
            targetId={highlightTarget.inquiry(project, number, inquiry.inquiry)}
            isRequested={isHighlighted}
            className={classNames(
                "overflow-hidden rounded-md border border-content3 bg-content1",
                !isOpen && "opacity-60"
            )}
        >
            <div className="flex flex-col">
                <div
                    className={classNames(
                        "flex cursor-pointer items-center gap-2 px-2.5 py-2",
                        isOpen ? meta.titleClass : "bg-success-100/60"
                    )}
                    onClick={() => setIsFolded((previous) => !previous)}
                >
                    <button
                        type="button"
                        aria-expanded={!isFolded}
                        aria-label={isFolded ? "Show inquiry" : "Hide inquiry"}
                        className="flex shrink-0 cursor-pointer text-foreground/40"
                    >
                        <motion.span
                            className="flex"
                            animate={{ rotate: isFolded ? 0 : 90 }}
                            transition={FOLD_TRANSITION}
                        >
                            <FontAwesomeIcon icon={faChevronRight} />
                        </motion.span>
                    </button>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <TouchTooltip
                            classNames={{ content: "p-0 overflow-hidden max-w-72" }}
                            content={
                                <div className="flex flex-col">
                                    <SeverityBadge severity={inquiry.severity} />
                                    <div className="px-3 py-2 text-xs text-foreground/70">{meta.description}</div>
                                </div>
                            }
                        >
                            <span className={classNames("flex shrink-0 cursor-help text-lg", meta.iconClass)}>
                                <FontAwesomeIcon icon={meta.icon} />
                            </span>
                        </TouchTooltip>
                        <span className="flex-1 min-w-0 text-sm font-semibold leading-snug">{inquiry.summary}</span>
                        <ResolvedMark inquiry={inquiry} />
                        <div
                            className={classNames("shrink-0 items-center gap-2", {
                                flex: hasTitleControls,
                                hidden: !hasTitleControls
                            })}
                        >
                            {isStale && (
                                <TitleChip
                                    color="warning"
                                    icon={faTriangleExclamation}
                                    label={isOutdated ? "Outdated" : inquiry.version}
                                    heading={isOutdated ? "Outdated" : `Raised against ${inquiry.version}`}
                                >
                                    {isOutdated ? (
                                        <>
                                            The version this was raised against no longer exists - the draft carrying it
                                            was deleted. Saving it again takes it as still accurate against the card as
                                            it stands.
                                        </>
                                    ) : (
                                        <>
                                            The card has changed since this was raised. Saving it again takes it as
                                            still accurate against the card as it stands.
                                        </>
                                    )}
                                </TitleChip>
                            )}
                            {isAddressed && (
                                <TitleChip
                                    color="success"
                                    icon={faCheck}
                                    label={inquiry.addressedIn ?? ""}
                                    heading={`Addressed in ${inquiry.addressedIn}`}
                                >
                                    A card update claims to have settled this. It stays open until somebody resolves it.
                                </TitleChip>
                            )}
                            {isFixWithdrawn && (
                                <TitleChip
                                    color="warning"
                                    icon={faTriangleExclamation}
                                    label="Fix withdrawn"
                                    heading="Fix withdrawn"
                                >
                                    This was settled by {inquiry.addressedIn}, which no longer exists - the draft
                                    carrying it was deleted. The change may have gone with it, so reopen this if the
                                    point still stands.
                                </TitleChip>
                            )}
                            {isOpen && (
                                <TitleActions
                                    canEdit={canEdit}
                                    canDelete={canDelete}
                                    isDisabled={isSaving}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {!isFolded && (
                        <motion.div
                            key="body"
                            className="overflow-hidden"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={FOLD_TRANSITION}
                        >
                            <div className="flex flex-col gap-2.5 px-3 pb-3 pt-2.5">
                                {hasBody && (
                                    <div className="flex flex-col gap-1">
                                        <div className="relative">
                                            <div
                                                ref={bodyRef}
                                                className="flex flex-col gap-2.5 overflow-hidden transition-all duration-300"
                                                style={{
                                                    maxHeight: isExpanded
                                                        ? bodyRef.current?.scrollHeight
                                                        : COLLAPSED_HEIGHT
                                                }}
                                            >
                                                {inquiry.detail && (
                                                    <div className="text-sm text-foreground/80">
                                                        <RichText html={inquiry.detail} />
                                                    </div>
                                                )}
                                            </div>
                                            {!isExpanded && isOverflowing && (
                                                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-content1 to-transparent" />
                                            )}
                                        </div>
                                        {isOverflowing && (
                                            <button
                                                type="button"
                                                className="self-start text-xs text-foreground/50 hover:text-default-600"
                                                onClick={() => setIsExpanded((previous) => !previous)}
                                            >
                                                {isExpanded ? "Show less" : "Read more..."}
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div
                                    className={classNames(
                                        "flex flex-wrap items-center gap-2",
                                        hasBody && "border-t border-content3/60 pt-2"
                                    )}
                                >
                                    <div className="flex flex-1 min-w-0 items-center gap-1.5 text-xs text-foreground/60">
                                        <span className="mr-1.5 font-mono text-sm tabular-nums text-foreground/25">
                                            #{inquiry.inquiry}
                                        </span>
                                        <UserRow discordId={inquiry.createdBy} />
                                        <span className="text-foreground/25">·</span>
                                        <Timestamp date={inquiry.created} />
                                    </div>
                                    <div className="flex w-full items-center gap-2 md:w-auto">
                                        <DiscussionButton
                                            project={project}
                                            number={number}
                                            inquiry={inquiry}
                                            canStart={canStartDiscussion}
                                            isDisabled={isSaving}
                                            className={ACTION_CLASS}
                                        />
                                        {canResolve &&
                                            (isOpen ? (
                                                <Button
                                                    size="sm"
                                                    color="success"
                                                    className={ACTION_CLASS}
                                                    isDisabled={isSaving}
                                                    startContent={
                                                        <FontAwesomeIcon icon={faCircleCheck} className="text-base" />
                                                    }
                                                    onPress={onResolve}
                                                >
                                                    Resolve
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="flat"
                                                    className={ACTION_CLASS}
                                                    isDisabled={isSaving}
                                                    startContent={
                                                        <FontAwesomeIcon icon={faRotateLeft} className="text-base" />
                                                    }
                                                    onPress={onReopen}
                                                >
                                                    Reopen
                                                </Button>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </HighlightTarget>
    );
}

type InquiryCardProps = {
    project: number;
    number: number;
    inquiry: IRefinementInquiry;
    version?: SemanticVersion;
    canEdit: boolean;
    canDelete: boolean;
    canResolve: boolean;
    /** Whether this viewer may take an inquiry to Discord; following one already there needs no permission */
    canStartDiscussion: boolean;
    isSaving: boolean;
    /** Draw attention to this one on arrival - set by whoever navigated here naming it */
    isHighlighted?: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onResolve: () => void;
    onReopen: () => void;
};
