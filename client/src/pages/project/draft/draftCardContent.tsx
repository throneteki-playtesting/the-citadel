import { memo } from "react";
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { CardPreview } from "@agot/card-preview";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { IPlaytestCard } from "common/models/cards";
import { SlotCondition, slotConditionIssues } from "common/models/slotConditions";
import CardCornerBadges, { CornerBadge } from "../../../components/cardCornerBadges";
import Crossfade from "../../../components/crossfade";
import { FLAT_BUTTON_CLASS } from "../../../constants";
import { CardAction, CardHandlers, useCardActions } from "./useCardActions";
import { renderDraftCard } from "./draftSlots";

// Memoised, so a slot redrawing for a drag only redraws the cards whose rank it changes
const DraftCardContent = memo(function DraftCardContent({
    card,
    rank,
    slotNumber,
    conditions,
    isUpright,
    onEdit,
    onDelete
}: DraftCardContentProps) {
    const actions = useCardActions({ onEdit, onDelete })(card);
    return (
        <div className="size-full relative">
            <DraftCardBadges issues={slotConditionIssues(conditions, card)} actions={actions} />
            <div className="relative h-full flex justify-center items-center">
                <div className="relative w-full">
                    <Crossfade contentKey={`${String(card.updated)}|${rank}`}>
                        <CardPreview
                            className="select-none"
                            orientation={isUpright ? "vertical" : undefined}
                            card={renderDraftCard(card, rank, slotNumber)}
                        />
                    </Crossfade>
                </div>
            </div>
        </div>
    );
});

export default DraftCardContent;

type DraftCardContentProps = CardHandlers & {
    card: IPlaytestCard;
    rank: number;
    slotNumber: number;
    conditions?: SlotCondition[];
    isUpright: boolean;
};

// The alert first, then the card's menu - faint until hovered, so the alert is what catches the eye
export function DraftCardBadges({ issues, actions }: { issues: string[]; actions: CardAction[] }) {
    if (issues.length === 0 && actions.length === 0) {
        return null;
    }
    return (
        <CardCornerBadges
            isolateClicks
            badges={[]}
            leading={
                <>
                    {issues.length > 0 && (
                        <CornerBadge
                            icon={faTriangleExclamation}
                            color="warning"
                            pulse
                            title="Doesn't Fit Its Slot"
                            description={
                                <div className="flex flex-col gap-1 pt-0.5">
                                    <span className="text-foreground/70">
                                        The maesters advise heeding this slot's conditions:
                                    </span>
                                    <ul className="list-disc pl-4">
                                        {issues.map((issue) => (
                                            <li key={issue}>{issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            }
                        />
                    )}
                    {actions.length > 0 && (
                        <div className="opacity-25 hover:opacity-90 transition-opacity">
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button
                                        isIconOnly
                                        radius="full"
                                        size="sm"
                                        variant="faded"
                                        className={FLAT_BUTTON_CLASS}
                                    >
                                        <FontAwesomeIcon icon={faEllipsis} />
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu aria-label="Card actions" items={actions}>
                                    {(action) => (
                                        <DropdownItem
                                            key={action.key}
                                            className={action.className}
                                            startContent={<FontAwesomeIcon icon={action.icon} />}
                                            onPress={action.onPress}
                                        >
                                            {action.label}
                                        </DropdownItem>
                                    )}
                                </DropdownMenu>
                            </Dropdown>
                        </div>
                    )}
                </>
            }
        />
    );
}
