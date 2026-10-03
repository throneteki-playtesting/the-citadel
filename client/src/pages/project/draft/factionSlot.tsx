import { memo, ReactNode, useCallback, useMemo, useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { CardBlank } from "@agot/card-preview";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListOl, faSliders, faStarOfLife } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { IPlaytestCard } from "common/models/cards";
import Permission from "common/models/permissions";
import { thronesColors } from "common/utils";
import CardStack from "../../../components/cardStack";
import PermissionGate from "../../../components/permissionGate";
import RadialMenu from "../../../components/radialMenu";
import { usePermission } from "../../../hooks/usePermission";
import {
    DRAFT_PLOT_WIDTH_CLASS,
    DRAFT_STACK_TILT,
    FLAT_BUTTON_CLASS,
    LANDSCAPE_ASPECT_CLASS,
    PORTRAIT_ASPECT_CLASS,
    RADIAL_ITEM_CLASS,
    suggestionIcons
} from "../../../constants";
import { BaseElementProps } from "../../../types";
import SlotFrame, { SlotAction } from "./slotFrame";
import DraftCardContent from "./draftCardContent";
import { CardHandlers } from "./useCardActions";
import { DragData, useSlotDrag } from "./draftDragStore";
import { DraftSlot, getDragUid, isCarried, isUprightPlot, nextSelection, projectedRank } from "./draftSlots";

export type SlotHandlers = CardHandlers & {
    onNew: (slot: DraftSlot) => void;
    onSuggestion: (slot: DraftSlot) => void;
    onArrange: (slot: DraftSlot) => void;
    onEditOptions: (slot: DraftSlot) => void;
    registerPile: (number: number, element: HTMLElement | null) => void;
};

// The frame holds the row's height, and its header strip (h-6 + gap-1) comes out of the card's share of it
function frameShapeClass(isOnlyPlots: boolean) {
    return isOnlyPlots ? classNames(DRAFT_PLOT_WIDTH_CLASS, "self-start") : "h-full";
}

function slotShapeClass(isOnlyPlots: boolean) {
    return isOnlyPlots
        ? classNames("w-full", LANDSCAPE_ASPECT_CLASS)
        : classNames("h-[calc(100%-1.75rem)]", PORTRAIT_ASPECT_CLASS);
}

const FactionSlot = memo(function FactionSlot({
    slot,
    zIndex,
    isArranging,
    isLifted,
    onNew,
    onSuggestion,
    onArrange,
    onEditOptions,
    registerPile,
    onEdit,
    onDelete
}: FactionSlotProps) {
    const { isHeld, isReceiving, leavingVersion } = useSlotDrag(slot.number);
    const topIndex = Math.max(0, slot.options.length - 1);
    const [selectedIndex, setSelectedIndex] = useState(topIndex);
    // Bottom to top, matching the stack's own order
    const order = slot.options.map((card) => card.version).reverse();
    const [previousOrder, setPreviousOrder] = useState(order);
    if (order.join() !== previousOrder.join()) {
        setPreviousOrder(order);
        setSelectedIndex(nextSelection(previousOrder, order, selectedIndex));
    }
    if (isLifted && selectedIndex !== topIndex) {
        setSelectedIndex(topIndex);
    }

    const canCreate = usePermission(Permission.CREATE_CARDS);
    const canReadSuggestions = usePermission(Permission.READ_SUGGESTIONS);
    const canEditSlot = usePermission(Permission.EDIT_SLOTS);
    const slotActions = useMemo(
        (): SlotAction[] =>
            [
                canCreate && { key: "new", label: "Add new card", icon: faStarOfLife, onPress: () => onNew(slot) },
                canReadSuggestions && {
                    key: "suggestion",
                    label: "Add suggestion",
                    icon: suggestionIcons.base,
                    onPress: () => onSuggestion(slot)
                },
                canEditSlot && {
                    key: "options",
                    label: "Edit options",
                    icon: faSliders,
                    onPress: () => onEditOptions(slot)
                }
            ].flatMap((action) => (action ? [action] : [])),
        [canCreate, canReadSuggestions, canEditSlot, slot, onNew, onSuggestion, onEditOptions]
    );
    const hasArrange = canEditSlot && slot.options.length > 1;
    const arrangeAction = useMemo(
        (): SlotAction | undefined =>
            hasArrange
                ? { key: "arrange", label: "Arrange", icon: faListOl, onPress: () => onArrange(slot) }
                : undefined,
        [hasArrange, slot, onArrange]
    );
    const onNewHere = useCallback(() => onNew(slot), [onNew, slot]);
    const onSuggestionHere = useCallback(() => onSuggestion(slot), [onSuggestion, slot]);

    const stackedCards = [...slot.options].reverse();
    const topCard = stackedCards[Math.min(selectedIndex, stackedCards.length - 1)];
    const hasNonPlot = slot.options.some((card) => card.type !== "plot");
    const isOnlyPlots = slot.options.length > 0 && !hasNonPlot;
    return (
        <SlotFrame
            slot={slot.slot}
            primaryAction={arrangeAction}
            actions={slotActions}
            className={frameShapeClass(isOnlyPlots)}
        >
            <DroppableSlot slot={slot} isOnlyPlots={isOnlyPlots} isHeld={isHeld} className="relative">
                <div className="absolute inset-0">
                    <EmptyCardSlot slot={slot} onNew={onNewHere} onSuggestion={onSuggestionHere} />
                </div>
                <div
                    ref={(element) => registerPile(slot.number, element)}
                    className={classNames(
                        "absolute inset-0 transition-transform ease-out",
                        isHeld ? "scale-95 duration-[250ms]" : "duration-200",
                        { invisible: isArranging, "pointer-events-none": !topCard }
                    )}
                >
                    <CardStack
                        cards={stackedCards}
                        selectedIndex={selectedIndex}
                        behaviour="stacked"
                        isInstant={isArranging}
                        cardKey={getDragUid}
                        isCarried={isCarried}
                        tilt={DRAFT_STACK_TILT}
                        className="h-full"
                        style={{ zIndex }}
                        onClick={() => setSelectedIndex((prev) => (prev === 0 ? slot.options.length - 1 : --prev))}
                    >
                        {(card) => (
                            <DraggableCard
                                card={card}
                                slotNumber={slot.number}
                                isDraggable={card === topCard}
                                isHeld={isHeld}
                            >
                                <DraftCardContent
                                    card={card}
                                    rank={projectedRank(slot.options, card, isReceiving, leavingVersion)}
                                    slotNumber={slot.number}
                                    conditions={slot.slot.conditions}
                                    isUpright={isUprightPlot(card, hasNonPlot)}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                />
                            </DraggableCard>
                        )}
                    </CardStack>
                </div>
            </DroppableSlot>
        </SlotFrame>
    );
});

export default FactionSlot;

type FactionSlotProps = SlotHandlers & {
    slot: DraftSlot;
    zIndex: number;
    isArranging: boolean;
    /** Its cards have left for Arrange, so the pile is put back in order unseen, ready for them to land on */
    isLifted: boolean;
};

function DroppableSlot({ className, style, slot, isOnlyPlots, isHeld, children }: DroppableSlotProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: `slot-${slot.number}`,
        data: { faction: slot.faction, number: slot.number }
    });
    return (
        <div
            ref={setNodeRef}
            className={classNames(
                slotShapeClass(isOnlyPlots),
                "shrink-0 rounded-lg outline-2 outline-dashed outline-offset-2 transition-colors duration-200",
                isOver && !isHeld ? "outline-primary" : "outline-transparent",
                className
            )}
            style={style}
        >
            {children}
        </div>
    );
}

type DroppableSlotProps = BaseElementProps & {
    slot: DraftSlot;
    isOnlyPlots: boolean;
    /** Pressed but not yet moved - not a drag until it is, so no slot offers itself */
    isHeld: boolean;
};

// Worn by every card in the pile and live only on top - a wrapper added as a card surfaces would remount it mid-tilt
function DraggableCard({ card, slotNumber, isDraggable, isHeld, children }: DraggableCardProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `card-${getDragUid(card)}`,
        data: { card, slotNumber } satisfies DragData,
        disabled: !isDraggable
    });
    return (
        <div
            ref={setNodeRef}
            {...(isDraggable && { ...listeners, ...attributes })}
            className={classNames("size-full", {
                "touch-manipulation cursor-grab active:cursor-grabbing": isDraggable,
                "opacity-0": isDragging && !isHeld
            })}
        >
            <div className="size-full">{children}</div>
        </div>
    );
}

type DraggableCardProps = {
    card: IPlaytestCard;
    slotNumber: number;
    isDraggable: boolean;
    isHeld: boolean;
    children: ReactNode;
};

const EmptyCardSlot = memo(function EmptyCardSlot({ slot, onNew, onSuggestion }: EmptyCardSlotProps) {
    const [isActive, setIsActive] = useState(false);
    const isEmpty = slot.options.length === 0;
    const isOnlyPlots = !isEmpty && slot.options.every((card) => card.type === "plot");
    // Mounted only while it can be seen, so a page of filled slots isn't a page of hidden buttons
    const [isMenuMounted, setIsMenuMounted] = useState(isEmpty);
    if (isEmpty && !isMenuMounted) {
        setIsMenuMounted(true);
    }

    return (
        <div className="relative h-full flex justify-center items-center">
            <div className="relative w-full">
                <CardBlank
                    className={classNames({
                        "transition-all duration-200 ease-in-out not-hover:brightness-75 hover:brightness-100":
                            !isActive,
                        "brightness-100": isActive
                    })}
                    rounded
                    classNames={{
                        inner: "flex flex-col justify-center items-center border-12 bg-default-100 brightness-50"
                    }}
                    styles={{
                        inner: {
                            borderColor: thronesColors[slot.faction],
                            ...(isOnlyPlots && { width: "333px", height: "240px" })
                        }
                    }}
                    onClick={() => !isActive && setIsActive(true)}
                    orientation={isOnlyPlots ? "horizontal" : undefined}
                />
            </div>
            <div
                className={classNames(
                    "z-0 absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-500",
                    isEmpty ? "opacity-100" : "opacity-0"
                )}
                onTransitionEnd={(e) => {
                    if (e.target === e.currentTarget && e.propertyName === "opacity" && !isEmpty) {
                        setIsMenuMounted(false);
                    }
                }}
            >
                {isMenuMounted && (
                    <RadialMenu
                        className="size-16 sm:size-20 md:size-28 lg:size-32"
                        isOpen={isActive}
                        onOpenChange={setIsActive}
                        classNames={{ button: "h-10 w-10" }}
                    >
                        <PermissionGate requires={Permission.CREATE_CARDS}>
                            <Tooltip content="Create new card">
                                <Button
                                    isIconOnly
                                    radius="full"
                                    variant="flat"
                                    color="primary"
                                    size="sm"
                                    className={classNames(RADIAL_ITEM_CLASS, FLAT_BUTTON_CLASS)}
                                    onPress={onNew}
                                >
                                    <FontAwesomeIcon icon={faStarOfLife} />
                                </Button>
                            </Tooltip>
                        </PermissionGate>
                        <PermissionGate requires={Permission.READ_SUGGESTIONS}>
                            <Tooltip content="Choose suggestion">
                                <Button
                                    isIconOnly
                                    radius="full"
                                    variant="flat"
                                    color="primary"
                                    size="sm"
                                    className={classNames(RADIAL_ITEM_CLASS, FLAT_BUTTON_CLASS)}
                                    onPress={onSuggestion}
                                >
                                    <FontAwesomeIcon icon={suggestionIcons.base} />
                                </Button>
                            </Tooltip>
                        </PermissionGate>
                    </RadialMenu>
                )}
            </div>
        </div>
    );
});

type EmptyCardSlotProps = {
    slot: DraftSlot;
    onNew: () => void;
    onSuggestion: () => void;
};
