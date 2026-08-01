import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Chip, ChipProps } from "@heroui/react";
import { TouchTooltip } from "./touchTooltip";
import TooltipDetail from "./tooltipDetail";

export default function SummaryChip({ icon, color = "default", label, heading, children }: SummaryChipProps) {
    return (
        <TouchTooltip content={<TooltipDetail heading={heading}>{children}</TooltipDetail>} size="sm" delay={0}>
            <Chip
                size="sm"
                variant="flat"
                color={color}
                className="pointer-events-auto cursor-pointer h-7 px-1"
                startContent={<FontAwesomeIcon icon={icon} className="ml-1.5" />}
            >
                {label}
            </Chip>
        </TouchTooltip>
    );
}

type SummaryChipProps = {
    icon: IconDefinition;
    color?: ChipProps["color"];
    label: string;
    heading: React.ReactNode;
    children: React.ReactNode;
};
