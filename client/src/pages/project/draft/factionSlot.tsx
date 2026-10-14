import { memo, ReactNode, useCallback, useMemo, useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { motion } from "framer-motion";
import { CardBlank } from "@agot/card-preview";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListOl, faSliders, faStarOfLife } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import classNames from "classnames";
import { compact } from "lodash-es";
import { Faction, IPlaytestCard } from "common/models/cards";
import Permission from "common/models/permissions";
import { previewOf, previewUrlOf, slotReveal } from "common/models/slots";
import { thronesColors } from "common/utils";
import CardStack from "../../../components/cardStack";
import PermissionGate from "../../../components/permissionGate";
import RadialMenu from "../../../components/radialMenu";
import { openDiscordLink, useDiscordTarget } from "../../../hooks/useDiscordLink";
import { usePermission } from "../../../hooks/usePermission";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { useStableCallback } from "../../../hooks/useStableCallback";
import {
    DRAFT_SLOT_SIZE_CLASS,
    DRAFT_STACK_TILT,
    FLAT_BUTTON_CLASS,
    RADIAL_ITEM_CLASS,
    suggestionIcons
} from "../../../constants";
import { BaseElementProps } from "../../../types";
import SlotFrame, { SlotAction } from "./slotFrame";
import DraftCardContent from "./draftCardContent";
import { CardHandlers } from "./useCardActions";
import { DragData, useSlotDrag } from "./draftDragStore";
import { CardAction } from "./useCardActions";
import { usePreviewSync } from "./usePreviewSync";
import { cardRevealActions, RevealAction, revealActions, revealIcons, revealLabels } from "./revealState";
import { frameShape, QUARTER_TURN, SHAPE_TRANSITION, SHAPE_TRANSITION_CLASS, slotShape, blankShape } from "./slotShape";
import { setSlotMenuOpen, useIsSlotMenuOpen } from "./slotMenuStore";
import {
    DraftSlot,
    getDragUid,
    isCarried,
    isGhostEntry,
    isLandscapeSlot,
    isUprightPlot,
    nextSelection,
    projectedRank,
    StackEntry,
    stackKey
} from "./draftSlots";

export type SlotHandlers = CardHandlers & {
    onNew: (slot: DraftSlot) => void;
    onSuggestion: (slot: DraftSlot) => void;
    onArrange: (slot: DraftSlot) => void;
    onEditOptions: (slot: DraftSlot) => void;
    onStartDiscussion: (slot: DraftSlot) => Promise<void>;
    onReveal: (slot: DraftSlot, action: RevealAction) => void;
    registerPile: (number: number, element: HTMLElement | null) => void;
};

const FactionSlot = memo(function FactionSlot({
    slot,
    zIndex,
    isArranging,
    isLifted,
    isWrapped = false,
    onNew,
    onSuggestion,
    onArrange,
    onEditOptions,
    onStartDiscussion,
    onReveal,
    registerPile,
    onEdit,
    onDelete
}: FactionSlotProps) {
    const { isHeld, isReceiving, leavingVersion, incomingType: heldType } = useSlotDrag(slot.number);
    // Reshaped under a held card, a wrapped slot could wrap out from under it - so it waits for the card to land
    const incomingType = isWrapped ? undefined : heldType;
    const preview = previewOf(slot.slot);
    const { previewed, ghost } = slotReveal(slot.options, preview);
    // Bottom to top, matching the stack's own order - a revealed card's ghost takes its place once it has gone
    const piled = [...slot.options].reverse();
    const previewedAt = previewed ? piled.indexOf(previewed) : -1;
    const [ghostAt, setGhostAt] = useState(0);
    if (previewedAt >= 0 && previewedAt !== ghostAt) {
        setGhostAt(previewedAt);
    }
    const stackedCards: StackEntry[] = [...piled];
    if (ghost) {
        stackedCards.splice(Math.min(ghostAt, stackedCards.length), 0, { ghost });
    }
    const topIndex = Math.max(0, stackedCards.length - 1);
    const [selectedIndex, setSelectedIndex] = useState(topIndex);
    const order = stackedCards.map((entry) => (isGhostEntry(entry) ? "ghost" : entry.version));
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
    const canReveal = usePermission(Permission.REVEAL_DRAFT_CARDS);
    const canReadCardForum = usePermission(Permission.READ_DISCORD_CARD_FORUM);
    const target = useDiscordTarget();
    const isPreviewBusy = usePreviewSync(slot.slot);
    const revealable = useMemo(() => revealActions(slot.options, preview), [slot.options, preview]);
    const hasRevealed = !!preview;
    const discussionUrl = slot.slot._metadata?.discord?.messageUrl;
    const hasArrange = canEditSlot && slot.options.length > 1;
    const slotActions = useMemo(
        (): SlotAction[][] =>
            [
                [
                    canCreate && { key: "new", label: "Add new card", icon: faStarOfLife, onPress: () => onNew(slot) },
                    canReadSuggestions && {
                        key: "suggestion",
                        label: "Add Suggestions",
                        icon: suggestionIcons.base,
                        onPress: () => onSuggestion(slot)
                    }
                ],
                [
                    hasArrange && {
                        key: "arrange",
                        label: "Arrange",
                        icon: faListOl,
                        onPress: () => onArrange(slot)
                    },
                    canEditSlot && {
                        key: "options",
                        label: "Edit options",
                        icon: faSliders,
                        onPress: () => onEditOptions(slot)
                    }
                ],
                [
                    !discussionUrl &&
                        canCreate && {
                            key: "discussion",
                            label: "Start discussion",
                            icon: faDiscord,
                            onPress: () => onStartDiscussion(slot)
                        },
                    ...(canReveal
                        ? revealable.map(
                              (action): SlotAction => ({
                                  key: `reveal-${action}`,
                                  label: revealLabels[action],
                                  icon: revealIcons[action],
                                  onPress: () => onReveal(slot, action)
                              })
                          )
                        : [])
                ]
            ]
                .map((group) => group.flatMap((action) => (action ? [action] : [])))
                .filter((group) => group.length > 0),
        [
            canCreate,
            canReadSuggestions,
            canEditSlot,
            canReveal,
            revealable,
            hasArrange,
            discussionUrl,
            slot,
            onReveal,
            onNew,
            onSuggestion,
            onEditOptions,
            onStartDiscussion,
            onArrange
        ]
    );
    // What each card can do beyond editing and deleting
    const cardActions = useMemo(
        () =>
            new Map(
                slot.options.map((card) => [
                    card,
                    compact([
                        canReadCardForum &&
                            preview &&
                            card === previewed && {
                                key: "preview-link",
                                group: "reveal",
                                label: "Card preview",
                                icon: faDiscord,
                                isBusy: isPreviewBusy,
                                onPress: () => openDiscordLink(previewUrlOf(preview), target)
                            },
                        ...(canReveal
                            ? cardRevealActions(card, slot.options, preview).map(
                                  (action): CardAction => ({
                                      key: `reveal-${action}`,
                                      group: "reveal",
                                      label: revealLabels[action],
                                      icon: revealIcons[action],
                                      onPress: () => onReveal(slot, action)
                                  })
                              )
                            : [])
                    ])
                ])
            ),
        [canReadCardForum, canReveal, isPreviewBusy, onReveal, preview, previewed, slot, target]
    );
    const onNewHere = useStableCallback(() => onNew(slot));
    const onSuggestionHere = useStableCallback(() => onSuggestion(slot));
    const pileRef = useCallback(
        (element: HTMLElement | null) => registerPile(slot.number, element),
        [registerPile, slot.number]
    );

    const topCard = stackedCards[Math.min(selectedIndex, stackedCards.length - 1)];
    // A card held over the slot shows it as it would be with that card in it - its shape, and plots standing upright
    // beside one which isn't a plot
    const hasNonPlot =
        slot.options.some((card) => card.type !== "plot") || (incomingType !== undefined && incomingType !== "plot");
    const isLandscape = isLandscapeSlot(slot.slot.conditions, slot.options, incomingType);
    const frame = (
        <SlotFrame
            slot={slot.slot}
            actions={slotActions}
            isRevealed={hasRevealed}
            className={SHAPE_TRANSITION_CLASS}
            style={frameShape(isLandscape)}
        >
            <DroppableSlot
                slot={slot}
                isLandscape={isLandscape}
                isHeld={isHeld}
                isTargeted={isReceiving}
                className="relative"
            >
                <div className="absolute inset-0">
                    <EmptyCardSlot
                        slotNumber={slot.number}
                        faction={slot.faction}
                        isEmpty={slot.options.length === 0}
                        isLandscape={isLandscape}
                        onNew={onNewHere}
                        onSuggestion={onSuggestionHere}
                    />
                </div>
                <div
                    ref={pileRef}
                    className={classNames(
                        "absolute inset-0 transition-transform ease-out",
                        isHeld ? "scale-95 duration-[250ms]" : "duration-200",
                        { invisible: isArranging, "pointer-events-none": slot.options.length === 0 }
                    )}
                >
                    <CardStack
                        cards={stackedCards}
                        selectedIndex={selectedIndex}
                        behaviour="stacked"
                        isInstant={isArranging}
                        cardKey={stackKey}
                        isCarried={(entry) => !isGhostEntry(entry) && isCarried(entry)}
                        isGhost={isGhostEntry}
                        tilt={DRAFT_STACK_TILT}
                        className="h-full"
                        style={{ zIndex }}
                        hasCentre
                        onShuffle={(step) =>
                            setSelectedIndex((prev) => (prev + step + stackedCards.length) % stackedCards.length)
                        }
                    >
                        {(entry) =>
                            isGhostEntry(entry) ? (
                                <DraftCardContent
                                    card={entry.ghost}
                                    rank={slot.options.length}
                                    slotNumber={slot.number}
                                    isUpright={isUprightPlot(entry.ghost, hasNonPlot)}
                                    isGhost
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                />
                            ) : (
                                <DraggableCard
                                    card={entry}
                                    slotNumber={slot.number}
                                    isDraggable={entry === topCard}
                                    isHeld={isHeld}
                                    behind={
                                        entry === previewed &&
                                        preview && (
                                            <DraftCardContent
                                                card={preview}
                                                rank={slot.options.length}
                                                slotNumber={slot.number}
                                                isUpright={isUprightPlot(preview, hasNonPlot)}
                                                isGhost
                                                isCovered
                                                onEdit={onEdit}
                                                onDelete={onDelete}
                                            />
                                        )
                                    }
                                >
                                    <DraftCardContent
                                        card={entry}
                                        rank={projectedRank(slot.options, entry, isReceiving, leavingVersion)}
                                        slotNumber={slot.number}
                                        conditions={slot.slot.conditions}
                                        isUpright={isUprightPlot(entry, hasNonPlot)}
                                        isRevealed={entry === previewed}
                                        extraActions={cardActions.get(entry)}
                                        onEdit={onEdit}
                                        onDelete={onDelete}
                                    />
                                </DraggableCard>
                            )
                        }
                    </CardStack>
                </div>
            </DroppableSlot>
        </SlotFrame>
    );
    // The place snaps to its new shape so the row settles at once and can glide, while the frame eases into it
    return (
        <div className={classNames("shrink-0", DRAFT_SLOT_SIZE_CLASS)} style={frameShape(isLandscape)}>
            {frame}
        </div>
    );
});

export default FactionSlot;

type FactionSlotProps = SlotHandlers & {
    slot: DraftSlot;
    zIndex: number;
    isArranging: boolean;
    /** Its cards have left for Arrange, so the pile is put back in order unseen, ready for them to land on */
    isLifted: boolean;
    /** Wrapped in an expanded faction, so it waits for a held card to land before taking its shape */
    isWrapped?: boolean;
};

function DroppableSlot({ className, slot, isLandscape, isHeld, isTargeted, children }: DroppableSlotProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: `slot-${slot.number}`,
        data: { faction: slot.faction, number: slot.number }
    });
    return (
        <div
            ref={setNodeRef}
            className={classNames(
                "shrink-0 rounded-lg outline-2 outline-dashed outline-offset-2",
                SHAPE_TRANSITION_CLASS,
                (isOver || isTargeted) && !isHeld ? "outline-primary" : "outline-transparent",
                className
            )}
            style={slotShape(isLandscape)}
        >
            {children}
        </div>
    );
}

type DroppableSlotProps = BaseElementProps & {
    slot: DraftSlot;
    isLandscape: boolean;
    /** Pressed but not yet moved - not a drag until it is, so no slot offers itself */
    isHeld: boolean;
    /** A card in hand is bound for it, though not over it - eg. held over its faction's header */
    isTargeted: boolean;
};

// Worn by every card in the pile and live only on top - a wrapper added as a card surfaces would remount it mid-tilt
function DraggableCard({ card, slotNumber, isDraggable, isHeld, behind, children }: DraggableCardProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `card-${getDragUid(card)}`,
        data: { card, slotNumber } satisfies DragData,
        disabled: !isDraggable
    });
    return (
        <div className="relative size-full">
            <div className="pointer-events-none absolute inset-0 isolate z-0">{behind}</div>
            <div
                ref={setNodeRef}
                {...(isDraggable && { ...listeners, ...attributes })}
                className={classNames("relative z-10 size-full", {
                    "touch-manipulation cursor-grab active:cursor-grabbing": isDraggable,
                    "opacity-0": isDragging && !isHeld
                })}
            >
                <div className="size-full">{children}</div>
            </div>
        </div>
    );
}

type DraggableCardProps = {
    card: IPlaytestCard;
    slotNumber: number;
    isDraggable: boolean;
    isHeld: boolean;
    /** What lies beneath the card - seen once the card is lifted out of it, and kept below it however it is drawn */
    behind?: ReactNode;
    children: ReactNode;
};

const EmptyCardSlot = memo(function EmptyCardSlot({
    slotNumber,
    faction,
    isEmpty,
    isLandscape,
    onNew,
    onSuggestion
}: EmptyCardSlotProps) {
    const isActive = useIsSlotMenuOpen(slotNumber);
    const setIsActive = useCallback((isOpen: boolean) => setSlotMenuOpen(slotNumber, isOpen), [slotNumber]);
    const prefersReducedMotion = useReducedMotion();
    // Mounted only while it can be seen, so a page of filled slots isn't a page of hidden buttons
    const [isMenuMounted, setIsMenuMounted] = useState(isEmpty);
    if (isEmpty && !isMenuMounted) {
        setIsMenuMounted(true);
    }

    return (
        <div className="relative h-full">
            <motion.div
                initial={false}
                animate={{ rotate: isLandscape ? QUARTER_TURN : 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : SHAPE_TRANSITION}
                className={classNames(
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                    SHAPE_TRANSITION_CLASS
                )}
                style={blankShape(isLandscape)}
            >
                <CardBlank
                    className={classNames({
                        "transition-[filter] duration-200 ease-in-out not-hover:brightness-75 hover:brightness-100":
                            !isActive,
                        "brightness-100": isActive
                    })}
                    rounded
                    classNames={{
                        inner: "flex flex-col justify-center items-center border-12 bg-default-100 brightness-50"
                    }}
                    styles={{ inner: { borderColor: thronesColors[faction] } }}
                    onClick={() => !isActive && setIsActive(true)}
                />
            </motion.div>
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
                            <Tooltip content="Add new card">
                                <Button
                                    isIconOnly
                                    radius="full"
                                    variant="flat"
                                    color="primary"
                                    size="sm"
                                    className={classNames(RADIAL_ITEM_CLASS, FLAT_BUTTON_CLASS)}
                                    onPress={() => {
                                        setIsActive(false);
                                        onNew();
                                    }}
                                >
                                    <FontAwesomeIcon icon={faStarOfLife} />
                                </Button>
                            </Tooltip>
                        </PermissionGate>
                        <PermissionGate requires={Permission.READ_SUGGESTIONS}>
                            <Tooltip content="Add Suggestions">
                                <Button
                                    isIconOnly
                                    radius="full"
                                    variant="flat"
                                    color="primary"
                                    size="sm"
                                    className={classNames(RADIAL_ITEM_CLASS, FLAT_BUTTON_CLASS)}
                                    onPress={() => {
                                        setIsActive(false);
                                        onSuggestion();
                                    }}
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
    slotNumber: number;
    faction: Faction;
    isEmpty: boolean;
    /** Lies on its side - the slot's plots, or the plot about to be put in it */
    isLandscape: boolean;
    onNew: () => void;
    onSuggestion: () => void;
};
