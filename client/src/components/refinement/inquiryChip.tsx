import { Chip } from "@heroui/react";
import { faComment } from "@fortawesome/free-solid-svg-icons";
import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import {
    InquiryDecision,
    inquiryDecision,
    IRefinementInquiry,
    isInquiryDiscussing,
    isInquiryOpen,
    isInquiryStale
} from "common/models/refinement";
import { SemanticVersion } from "common/utils";
import { truncateHtml } from "common/richText/truncate";
import { inquiryDecisionMeta, inquirySeverityMeta } from "../../constants";
import { TouchTooltip } from "../touchTooltip";
import UserAvatar from "../userAvatar";
import RichText from "../richText";
import Timestamp from "../timestamp";
import { SeverityBadge } from "./severitySelect";

const PREVIEW_LENGTH = 160;

// One inquiry in a row of them - its severity icon, with a decision pinned bottom-right and a discussion top-right
export default function InquiryChip({ inquiry, version, onPress }: InquiryChipProps) {
    const meta = inquirySeverityMeta[inquiry.severity];
    const isStale = isInquiryStale(inquiry, version);
    const decision = inquiryDecision(inquiry);
    const isDiscussing = isInquiryDiscussing(inquiry);
    const isOpen = isInquiryOpen(inquiry);
    const decisionMeta = decision && inquiryDecisionMeta[decision];
    // A resolved one answers to its outcome rather than its severity, as the inquiry card does
    const icon = isOpen ? meta.icon : faCircleCheck;
    const iconClass = isOpen ? meta.iconClass : "text-success";

    return (
        <TouchTooltip
            placement="top"
            classNames={{ content: "p-0 overflow-hidden max-w-72" }}
            content={
                <div className="flex flex-col">
                    <SeverityBadge severity={inquiry.severity} isOpen={isOpen} />
                    <div className="flex flex-col gap-1.5 px-3 py-2">
                        <span className="text-sm font-semibold leading-snug">{inquiry.summary}</span>
                        {inquiry.detail && (
                            <div className="text-xs text-foreground/60 leading-snug line-clamp-4">
                                <RichText html={truncateHtml(inquiry.detail, PREVIEW_LENGTH)} />
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-[.65rem] text-foreground/60">
                            <span className="font-mono text-sm tabular-nums text-foreground/25">
                                #{inquiry.inquiry}
                            </span>
                            <UserAvatar discordId={inquiry.createdBy} className="!size-4" />
                            {decision && decisionMeta && (
                                <Chip
                                    size="sm"
                                    variant="flat"
                                    color={decisionMeta.color}
                                    className="h-5 gap-1 px-1 text-[.65rem] tabular-nums"
                                    startContent={<FontAwesomeIcon icon={decisionMeta.icon} className="ml-1" />}
                                >
                                    {decisionLabel(inquiry, decision)}
                                </Chip>
                            )}
                            <Timestamp date={inquiry.created} />
                        </div>
                        {isDiscussing && (
                            <span className="flex items-center gap-1 text-[.65rem] text-primary">
                                <FontAwesomeIcon icon={faComment} /> Being discussed
                            </span>
                        )}
                        {isStale && <span className="text-[.65rem] text-warning">The card has changed since</span>}
                    </div>
                </div>
            }
        >
            <button
                type="button"
                aria-label={inquiryLabel(inquiry, meta.label, decision, isDiscussing)}
                className={classNames(
                    "relative flex shrink-0 cursor-pointer items-center px-1 py-0.5 text-base transition-transform hover:scale-110",
                    iconClass
                )}
                onClick={onPress}
            >
                <FontAwesomeIcon icon={icon} className={classNames((isStale || !isOpen) && "opacity-50")} />
                {decisionMeta && (
                    <span
                        className={classNames(
                            "absolute bottom-0 right-0 flex size-[0.6em] items-center justify-center rounded-full ring-2 ring-content1",
                            decisionMeta.badgeClass
                        )}
                    >
                        <FontAwesomeIcon icon={decisionMeta.icon} className="text-[0.4em]" />
                    </span>
                )}
                {isDiscussing && (
                    <span className="absolute right-0 top-0 size-[0.4em] rounded-full bg-primary ring-2 ring-content1" />
                )}
            </button>
        </TouchTooltip>
    );
}

function decisionLabel(inquiry: IRefinementInquiry, decision: InquiryDecision) {
    return decision === "addressed" ? (inquiry.addressedIn ?? "") : inquiryDecisionMeta.noChange.label;
}

function inquiryLabel(
    inquiry: IRefinementInquiry,
    severity: string,
    decision: InquiryDecision | undefined,
    isDiscussing: boolean
) {
    const parts = [`Inquiry #${inquiry.inquiry} - ${severity}`];
    if (decision) {
        parts.push(decision === "addressed" ? `addressed in ${inquiry.addressedIn}` : "no change");
    }
    if (isDiscussing) {
        parts.push("being discussed");
    }
    return parts.join(", ");
}

type InquiryChipProps = {
    inquiry: IRefinementInquiry;
    /** The card everything is measured against, so staleness reads the same here as in the editor */
    version?: SemanticVersion;
    onPress?: () => void;
};
