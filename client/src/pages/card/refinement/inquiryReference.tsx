import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { inquiryDecision, IRefinementInquiry } from "common/models/refinement";
import { inquiryDecisionMeta, inquirySeverityMeta } from "../../../constants";
import RichText from "../../../components/richText";
import Reveal from "../../../components/reveal";

// The open inquiries in full beside the card being edited, so their wording can be copied across
export default function InquiryReference({ inquiries, className }: InquiryReferenceProps) {
    return (
        <div className={classNames("flex flex-col gap-2 rounded-md border border-content3 bg-content1 p-2", className)}>
            <span className="px-1 font-cinzel text-sm uppercase tracking-wide text-foreground/60">Open inquiries</span>
            <Reveal className="flex flex-col gap-2">
                {inquiries.map((inquiry) => (
                    <InquiryReferenceEntry key={inquiry.inquiry} inquiry={inquiry} />
                ))}
            </Reveal>
        </div>
    );
}

function InquiryReferenceEntry({ inquiry }: { inquiry: IRefinementInquiry }) {
    const meta = inquirySeverityMeta[inquiry.severity];
    const decision = inquiryDecision(inquiry);

    return (
        <div className="flex flex-col gap-1 rounded-sm bg-content2/50 px-2 py-1.5 select-text">
            <div className="flex items-start gap-1.5">
                <FontAwesomeIcon icon={meta.icon} className={classNames("mt-0.5 shrink-0 text-xs", meta.iconClass)} />
                <span className="font-mono text-xs tabular-nums text-foreground/40">#{inquiry.inquiry}</span>
                <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{inquiry.summary}</span>
                {decision && (
                    <FontAwesomeIcon
                        icon={inquiryDecisionMeta[decision].icon}
                        title={
                            decision === "addressed"
                                ? `Addressed in ${inquiry.addressedIn}`
                                : inquiryDecisionMeta[decision].label
                        }
                        className={classNames("mt-0.5 shrink-0 text-xs", inquiryDecisionMeta[decision].iconClass)}
                    />
                )}
            </div>
            {inquiry.detail && (
                <div className="text-xs text-foreground/80">
                    <RichText html={inquiry.detail} />
                </div>
            )}
        </div>
    );
}

type InquiryReferenceProps = {
    inquiries: IRefinementInquiry[];
    className?: string;
};
