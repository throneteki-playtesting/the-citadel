import { useEffect, useRef } from "react";
import { Checkbox, CheckboxGroup } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import Permission from "common/models/permissions";
import { isInquiryOpen } from "common/models/refinement";
import { SemanticVersion } from "common/utils";
import { useGetSlotRefinementQuery } from "../../../api";
import { usePermission } from "../../../hooks/usePermission";
import { inquirySeverityMeta } from "../../../constants";

/**
 * Ticking an inquiry says this update addresses it. It stays open regardless, but the claim is what stops
 * the card's own change staling it in the meantime. Hidden entirely when there is nothing outstanding.
 */
export default function AddressedInquiries({ project, number, version, value, onChange }: AddressedInquiriesProps) {
    const canRead = usePermission(Permission.READ_REFINEMENT);
    const { data: refinement } = useGetSlotRefinementQuery(
        { project: project as number, number: number as number },
        { skip: !canRead || project === undefined || number === undefined }
    );

    const open = (refinement?.inquiries ?? []).filter(isInquiryOpen);

    // Reopening an existing draft has to show the claims it already makes, or saving it again would read
    // as unticking every one of them. Seeded once per version: after that the boxes are the caller's
    const seeded = useRef<SemanticVersion | undefined>(undefined);
    useEffect(() => {
        if (!version || !refinement || seeded.current === version) {
            return;
        }
        seeded.current = version;
        onChange(
            refinement.inquiries
                .filter((entry) => isInquiryOpen(entry) && entry.addressedIn === version)
                .map((entry) => entry.inquiry)
        );
    }, [version, refinement, onChange]);

    if (open.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-2 px-2">
            <div className="flex flex-col gap-0.5">
                <span className="text-xl">Refinement</span>
                <span className="text-xs text-foreground/60">
                    Tick anything this update addresses. They stay open until somebody confirms the fix.
                </span>
            </div>
            <CheckboxGroup
                value={value.map(String)}
                onValueChange={(values) => onChange(values.map(Number))}
                classNames={{ wrapper: "gap-1.5" }}
            >
                {open.map((inquiry) => {
                    const meta = inquirySeverityMeta[inquiry.severity];
                    return (
                        <Checkbox key={inquiry.inquiry} value={String(inquiry.inquiry)}>
                            <div className="flex items-center gap-1.5">
                                <FontAwesomeIcon icon={meta.icon} className={classNames("text-xs", meta.iconClass)} />
                                <span className="font-mono text-xs tabular-nums text-foreground/50">
                                    #{inquiry.inquiry}
                                </span>
                                <span className="text-sm">{inquiry.summary}</span>
                            </div>
                        </Checkbox>
                    );
                })}
            </CheckboxGroup>
        </div>
    );
}

type AddressedInquiriesProps = {
    project?: number;
    number?: number;
    /** The draft being edited, so its existing claims start ticked. Absent for a draft not yet created */
    version?: SemanticVersion;
    value: number[];
    onChange: (inquiries: number[]) => void;
};
