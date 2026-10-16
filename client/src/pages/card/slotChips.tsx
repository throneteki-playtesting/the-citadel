import { ReactNode } from "react";
import { Chip } from "@heroui/react";
import classNames from "classnames";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardCheck, faNoteSticky, faStar, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { IPlaytestCard } from "common/models/cards";
import { slotConditionVerdicts } from "common/models/slotConditions";
import { ISlot } from "common/models/slots";
import { useGetCardQuery, useGetSlotQuery } from "../../api";
import { TouchTooltip } from "../../components/touchTooltip";
import TooltipDetail from "../../components/tooltipDetail";
import RichText from "../../components/richText";
import { conditionLines } from "../../components/slots/conditionLines";

// The slot's options as one chip each, worded for playtesters, who know cards rather than slots
export default function SlotChips({ project, number }: { project: number; number: number }) {
    const { data: slot } = useGetSlotQuery({ project, number });
    const { data: card } = useGetCardQuery({ project, number, version: "visible" });

    if (!slot || !card) {
        return null;
    }
    const lines = conditionMarks(slot, card);
    const isStraying = lines.some((line) => line.issue);

    return (
        <>
            {lines.length > 0 && (
                <SlotChip
                    icon={isStraying ? faTriangleExclamation : faClipboardCheck}
                    label="Conditions"
                    color={isStraying ? "warning" : "default"}
                    heading="Card Conditions"
                >
                    <div className="flex flex-col gap-1">
                        <span>This card should be bound by the following requirements:</span>
                        {lines.map(({ key, token, text, issue }) => (
                            <span key={key} className={classNames("flex flex-col", { "text-warning": issue })}>
                                <span className="flex items-center gap-1.5 text-foreground">
                                    <span className="inline-flex w-5 shrink-0 justify-center">{token}</span>
                                    {text}
                                </span>
                                {issue && <span className="pl-6.5">{issue}</span>}
                            </span>
                        ))}
                    </div>
                </SlotChip>
            )}
            {slot.important && (
                <SlotChip icon={faStar} label="Important" color="primary" heading="Important Addition">
                    The project must deliver this card - its name holds through development, barring approval.
                </SlotChip>
            )}
            {slot.notes && (
                <SlotChip icon={faNoteSticky} label="Notes" heading="Card Notes">
                    <RichText html={slot.notes} />
                </SlotChip>
            )}
        </>
    );
}

function SlotChip({ icon, label, color = "default", heading, children }: SlotChipProps) {
    return (
        <TouchTooltip content={<TooltipDetail heading={heading}>{children}</TooltipDetail>}>
            <Chip
                size="sm"
                variant="flat"
                color={color}
                className="cursor-help"
                startContent={<FontAwesomeIcon icon={icon} className="ml-1" />}
            >
                {label}
            </Chip>
        </TouchTooltip>
    );
}

type SlotChipProps = {
    icon: IconDefinition;
    label: string;
    color?: "default" | "primary" | "warning";
    heading: string;
    children: ReactNode;
};

// A released card can no longer change to fit, so it is told what was asked but not judged
function conditionMarks(slot: ISlot, card: IPlaytestCard) {
    const isJudged = !card.released;
    return slotConditionVerdicts(slot.conditions, card, true).flatMap(({ condition, issue }) =>
        conditionLines(condition).map((line) => {
            if (!isJudged) {
                return { ...line, issue: undefined };
            }
            // Icons take a line each, so each answers for its own icon rather than for the condition as a whole
            if (condition.stat === "icons" && issue) {
                const icon = line.key as keyof typeof condition.icons;
                return { ...line, issue: !!card.icons?.[icon] === condition.icons[icon] ? undefined : issue };
            }
            return { ...line, issue };
        })
    );
}
