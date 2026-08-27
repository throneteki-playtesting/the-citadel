import { Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import classNames from "classnames";
import { InquirySeverity, inquirySeverities } from "common/models/refinement";
import { inquirySeverityMeta } from "../../constants";

/**
 * The one place a severity is chosen. Every option carries what it is for and a case that fits it, since
 * the boundary between two neighbouring severities is a judgement made consistent by saying it here.
 */
export default function SeveritySelect({ name, value, onChange, isDisabled }: SeveritySelectProps) {
    return (
        <Select
            name={name}
            label="Severity"
            isMultiline
            isRequired
            isDisabled={isDisabled}
            items={inquirySeverities.map((severity) => ({ severity }))}
            selectedKeys={value ? [value] : []}
            onSelectionChange={(keys) => onChange([...keys][0] as InquirySeverity)}
            renderValue={(items) =>
                items.map(({ key }) => key && <SeverityHeader key={key} severity={key as InquirySeverity} />)
            }
        >
            {({ severity }) => (
                <SelectItem key={severity} textValue={inquirySeverityMeta[severity].label}>
                    <SeverityHeader severity={severity} />
                    <div className="flex flex-col gap-1 p-1">
                        <span className="text-sm">{inquirySeverityMeta[severity].description}</span>
                        <span className="text-xs italic">Example: {inquirySeverityMeta[severity].example}</span>
                    </div>
                </SelectItem>
            )}
        </Select>
    );
}

export function SeverityHeader({ severity, className }: { severity: InquirySeverity; className?: string }) {
    const meta = inquirySeverityMeta[severity];
    return (
        <div className={classNames("flex items-center gap-1.5 text-medium", className)}>
            <FontAwesomeIcon icon={meta.icon} className={meta.iconClass} />
            <span className="font-bold leading-tight">{meta.label}</span>
        </div>
    );
}

/** The severity band a tooltip opens with - shared by the chip preview and the inquiry card's own tooltip */
export function SeverityBadge({ severity, isOpen }: { severity: InquirySeverity; isOpen?: boolean }) {
    const meta = inquirySeverityMeta[severity];
    return (
        <div className={classNames("flex items-center gap-1.5 px-3 py-1.5 text-xs", meta.classes)}>
            <FontAwesomeIcon icon={meta.icon} />
            <span className="flex-1 font-cinzel uppercase tracking-wide">{meta.label}</span>
            {isOpen === false && <FontAwesomeIcon icon={faCircleCheck} className="text-success" />}
        </div>
    );
}

type SeveritySelectProps = {
    name?: string;
    value?: InquirySeverity;
    onChange: (severity: InquirySeverity) => void;
    isDisabled?: boolean;
};
