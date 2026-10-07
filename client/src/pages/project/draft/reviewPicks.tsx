import { memo, useCallback } from "react";
import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { CardPreview } from "@agot/card-preview";
import { slotConditionIssues } from "common/models/slotConditions";
import { ISlot } from "common/models/slots";
import { DraftCardBadges } from "./draftCardContent";
import { isUprightPlot, renderDraftCard } from "./draftSlots";
import SortableCardGrid, { SortableCard } from "./sortableCardGrid";

// The picks as they will sit in the slot - dragged into order, each drawn as it will read once it is there
const ReviewPicks = memo(function ReviewPicks({
    cards,
    slot,
    hasNonPlot,
    cardWidth,
    problems,
    flightNodes,
    onReorder,
    onEdit
}: ReviewPicksProps) {
    const renderCard = useCallback(
        ({ id, card }: SortableCard, rank: number) => (
            <>
                <DraftCardBadges
                    issues={slotConditionIssues(slot.conditions, card)}
                    actions={[{ key: "edit", label: "Edit", icon: faPencil, onPress: () => onEdit(id) }]}
                    hasProblem={problems.has(id)}
                    isButton
                />
                <CardPreview
                    orientation={isUprightPlot(card, hasNonPlot) ? "vertical" : undefined}
                    card={renderDraftCard(card, rank, slot.number)}
                />
            </>
        ),
        [slot.conditions, slot.number, hasNonPlot, problems, onEdit]
    );
    return (
        <SortableCardGrid
            cards={cards}
            cardWidth={cardWidth}
            hasNonPlot={hasNonPlot}
            flightNodes={flightNodes}
            renderCard={renderCard}
            onReorder={onReorder}
        />
    );
});

export default ReviewPicks;

type ReviewPicksProps = {
    /** Each pick by its suggestion's id, with the card it will go in as */
    cards: SortableCard[];
    slot: ISlot;
    /** The slot's cards and these picks include something other than a plot, so plots stand upright */
    hasNonPlot: boolean;
    /** The width a card is drawn at on the draft page */
    cardWidth: number;
    /** The ids of picks which can't be saved as they are */
    problems: Set<string>;
    /** Each card's element by id, so the picks can be flown from where they sit */
    flightNodes: Map<string, HTMLElement>;
    onReorder: (ids: string[]) => void;
    onEdit: (id: string) => void;
};
