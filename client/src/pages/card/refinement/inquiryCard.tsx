import { ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faCheck,
    faChevronRight,
    faPencil,
    faRotateLeft,
    faTrash,
    faTriangleExclamation
} from "@fortawesome/free-solid-svg-icons";
import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
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
import { SeverityBadge } from "../../../components/refinement/severitySelect";

const COLLAPSED_HEIGHT = "8rem";
const FOLD_TRANSITION = { duration: 0.25, ease: EASE_STANDARD } as const;

/**
 * One mark in an inquiry's title row saying where it stands against the card. Never more than one at a
 * time, so they share a shape as well as a slot rather than reading as two different marks.
 */
function TitleChip({ color, icon, label, heading, children }: TitleChipProps) {
    return (
        <TouchTooltip content={<TooltipDetail heading={heading}>{children}</TooltipDetail>}>
            <Chip
                size="sm"
                variant="flat"
                color={color}
                className="shrink-0 gap-1 cursor-help tabular-nums"
                startContent={<FontAwesomeIcon icon={icon} className="ml-1.5" />}
            >
                {label}
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

/** One inquiry in full: what was raised, by whom, against which card, and where it stands */
export default function InquiryCard({
    project,
    number,
    inquiry,
    version,
    canEdit,
    canDelete,
    canResolve,
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
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
                            className={classNames("w-full items-center gap-2 md:w-auto", {
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
                            <div
                                className="ml-auto flex shrink-0 items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {isOpen && canEdit && (
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="solid"
                                        aria-label="Edit inquiry"
                                        isDisabled={isSaving}
                                        onPress={onEdit}
                                    >
                                        <FontAwesomeIcon icon={faPencil} />
                                    </Button>
                                )}
                                {isOpen && canDelete && (
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="solid"
                                        color="danger"
                                        aria-label="Delete inquiry"
                                        isDisabled={isSaving}
                                        onPress={onDelete}
                                    >
                                        <FontAwesomeIcon icon={faTrash} />
                                    </Button>
                                )}
                            </div>
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
                                    {canResolve &&
                                        (isOpen ? (
                                            <Button
                                                size="sm"
                                                color="success"
                                                className="shrink-0"
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
                                                className="shrink-0"
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
    isSaving: boolean;
    /** Draw attention to this one on arrival - set by whoever navigated here naming it */
    isHighlighted?: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onResolve: () => void;
    onReopen: () => void;
};
