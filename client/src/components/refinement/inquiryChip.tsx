import { Chip } from "@heroui/react";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { IRefinementInquiry, isInquiryAddressed, isInquiryOpen, isInquiryStale } from "common/models/refinement";
import { SemanticVersion } from "common/utils";
import { truncateHtml } from "common/richText/truncate";
import { inquirySeverityMeta } from "../../constants";
import { TouchTooltip } from "../touchTooltip";
import UserAvatar from "../userAvatar";
import RichText from "../richText";
import Timestamp from "../timestamp";
import { SeverityBadge } from "./severitySelect";

const PREVIEW_LENGTH = 160;

/**
 * One inquiry, small enough to sit in a row of them. The severity icon carries it alone, and the preview is
 * deliberately bite-sized - enough to recognise this inquiry without turning the row into the list it links to.
 */
export default function InquiryChip({ inquiry, version, onPress }: InquiryChipProps) {
    const meta = inquirySeverityMeta[inquiry.severity];
    const isStale = isInquiryStale(inquiry, version);
    const isAddressed = isInquiryAddressed(inquiry);
    const isOpen = isInquiryOpen(inquiry);
    // A resolved one answers to its outcome rather than its severity, the same swap the inquiry card
    // makes when it turns its title band green - the severity is still named in the tooltip
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
                            {isAddressed && (
                                <Chip
                                    size="sm"
                                    variant="flat"
                                    color="success"
                                    className="h-5 gap-1 px-1 text-[.65rem] tabular-nums"
                                    startContent={<FontAwesomeIcon icon={faCheck} className="ml-1" />}
                                >
                                    {inquiry.addressedIn}
                                </Chip>
                            )}
                            <Timestamp date={inquiry.created} />
                        </div>
                        {isStale && <span className="text-[.65rem] text-warning">The card has changed since</span>}
                    </div>
                </div>
            }
        >
            <button
                type="button"
                aria-label={`Inquiry #${inquiry.inquiry} - ${meta.label}`}
                className={classNames(
                    "flex shrink-0 cursor-pointer items-center px-0.5 text-base transition-transform hover:scale-110",
                    iconClass,
                    (isStale || !isOpen) && "opacity-50"
                )}
                onClick={onPress}
            >
                <FontAwesomeIcon icon={icon} />
            </button>
        </TouchTooltip>
    );
}

type InquiryChipProps = {
    inquiry: IRefinementInquiry;
    /** The card everything is measured against, so staleness reads the same here as in the editor */
    version?: SemanticVersion;
    onPress?: () => void;
};
