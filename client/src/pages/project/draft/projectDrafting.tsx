import { factionNames, parseCardCode, renderPlaytestingCard, thronesColors } from "common/utils";
import { useEffect, useMemo, useState } from "react";
import { IProject } from "common/models/projects";
import { Faction, factions, IPlaytestCard } from "common/models/cards";
import { DeepPartial } from "common/types";
import EditCardModal from "../../card/editCardModal";
import DeleteCardModal from "../../card/deleteCardModal";
import SelectSuggestionModal from "./selectSuggestionModal";
import { addToast, Button, Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, Skeleton, Tooltip } from "@heroui/react";
import { useCreateSlotMutation, useDeleteSlotMutation, useGetCardsQuery, useGetSlotsQuery, useMoveCardMutation } from "../../../api";
import api from "../../../api";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../../api/store";
import classNames from "classnames";
import ThronesIcon from "../../../components/thronesIcon";
import CardStack from "../../../components/cardStack";
import { CardBlank, CardPreview } from "@agot/card-preview";
import { faAddressCard, faEllipsis, faPencil, faPlus, faMinus, faStarOfLife, faTrash, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Permission from "common/models/permissions";
import PermissionGate from "../../../components/permissionGate";
import { groupBy } from "lodash-es";
import RadialMenu from "../../../components/radialMenu";
import { watermarkClasses } from "../../../constants";
import { BaseElementProps } from "../../../types";
import { usePermission } from "../../../hooks/usePermission";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { dropAnimation } from "../releases/releaseDnd";

type DraftSlot = {
    faction: Faction;
    number: number;
    options: IPlaytestCard[];
}

type DragData = { card: IPlaytestCard; slotNumber: number };

export default function ProjectDrafting({ project }: ProjectDraftingProps) {
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: { project: project.number, draft: true } });
    const { data: slotsData, isLoading: isLoadingSlots } = useGetSlotsQuery({ project: project.number });

    const [editing, setEditing] = useState<DeepPartial<IPlaytestCard>>();
    const [suggesting, setSuggesting] = useState<{ faction: Faction, number: number }>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();
    const [activeDrag, setActiveDrag] = useState<DragData>();

    const [moveCard] = useMoveCardMutation();
    const dispatch = useDispatch<AppDispatch>();

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
    );

    const factionSlots = useMemo(() => {
        const map = new Map<Faction, DraftSlot[]>();
        for (const faction of factions) {
            const slots = (slotsData?.items ?? [])
                .filter((slot) => slot.faction === faction)
                .sort((a, b) => a.number - b.number)
                .map((slot) => ({
                    faction,
                    number: slot.number,
                    options: (cardsData?.items ?? [])
                        .filter((c) => c.number === slot.number)
                        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
                }));
            map.set(faction, slots);
        }
        return map;
    }, [cardsData, slotsData]);

    const handleDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as DragData | undefined;
        if (data) setActiveDrag(data);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        setActiveDrag(undefined);
        const data = event.active.data.current as DragData | undefined;
        const target = event.over?.data.current as { faction: Faction, number: number } | undefined;
        if (!data || !target || data.slotNumber === target.number) {
            return;
        }

        const { card } = data;
        const patchResult = dispatch(
            api.util.updateQueryData("getCards", { filter: { project: project.number, draft: true } }, (draft) => {
                const patchTarget = draft.items.find((c) => c.number === card.number && c.version === card.version);
                if (patchTarget) {
                    patchTarget.number = target.number;
                    patchTarget.faction = target.faction;
                    // Newest-updated sorts to the top of the stack, which keeps the moved card draggable at its destination
                    patchTarget.updated = new Date().toISOString() as unknown as Date;
                }
            })
        );

        try {
            await moveCard({ project: project.number, number: card.number, version: card.version, to: target.number }).unwrap();
        } catch {
            patchResult.undo();
            addToast({ title: "Failed to move card", color: "danger", description: `'${card.name}' could not be moved to that slot` });
        }
    };

    if (isLoadingCards || isLoadingSlots) {
        return (
            <div className="space-y-2">
                {factions.map((faction) => <Skeleton key={faction} className="w-full h-64 sm:h-72 rounded-md"/>)}
            </div>
        );
    }

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(undefined)}>
            <div className="flex flex-col gap-2">
                {[...factionSlots.entries()].map(([faction, slots]) =>
                    <FactionCarousel
                        key={faction}
                        project={project.number}
                        faction={faction}
                        slots={slots}
                        onNew={(slot) => setEditing({ project: project.number, number: slot.number, code: parseCardCode(false, project.number, slot.number), faction: slot.faction, version: "0.0.0" })}
                        onSuggestion={(slot) => setSuggesting({ faction: slot.faction, number: slot.number })}
                        onEdit={(card) => setEditing(card)}
                        onDelete={(card) => setDeleting(card)}
                    />
                )}
            </div>
            <DragOverlay dropAnimation={dropAnimation}>
                {activeDrag && (
                    <div className="size-full cursor-grabbing">
                        <CardPreview card={renderPlaytestingCard(activeDrag.card, { top: "Moving", middle: `Card #${activeDrag.slotNumber}`, bottom: activeDrag.card.suggestionId ? "From Suggestion" : "New Design" })}/>
                    </div>
                )}
            </DragOverlay>
            <EditCardModal isOpen={!!editing} card={editing} onClose={() => setEditing(undefined)} onSave={(card) => addToast({ title: "Successfully saved", color: "success", description: `Slot #${card.number} has been saved` })}/>
            <SelectSuggestionModal
                isOpen={!!suggesting}
                project={project.number}
                number={suggesting?.number ?? 0}
                faction={suggesting?.faction}
                unselectable={cardsData?.items.filter((card) => card.faction === suggesting?.faction && card.suggestionId).map((card) => card.suggestionId!)}
                onClose={() => setSuggesting(undefined)}
                onSave={(card) => addToast({ title: "Successfully saved", color: "success", description: `Slot #${card.number} has been saved` })}
            />
            <DeleteCardModal isOpen={!!deleting} card={deleting} onClose={() => setDeleting(undefined)} onDelete={(card) => addToast({ title: "Successfully deleted", color: "success", description: `Slot #${card.number} has been deleted` })}/>
        </DndContext>
    );
};

type ProjectDraftingProps = { project: IProject; }

function FactionCarousel({ className, style, project, faction, slots, onNew, onSuggestion, onEdit, onDelete }: FactionCarouselProps) {
    const canCreateSlots = usePermission(Permission.CREATE_SLOTS);
    const canDeleteSlots = usePermission(Permission.DELETE_SLOTS);

    const [createSlot, { isLoading: isCreatingSlot }] = useCreateSlotMutation();
    const [deleteSlot, { isLoading: isDeletingSlot }] = useDeleteSlotMutation();

    const lastSlot = slots.at(-1);
    const lastSlotIsEmpty = !lastSlot || lastSlot.options.length === 0;

    const onAddSlot = async () => {
        try {
            await createSlot({ project, faction }).unwrap();
        } catch {
            addToast({ title: "Failed to add slot", color: "danger", description: `Could not add a new ${factionNames[faction]} slot` });
        }
    };

    const onRemoveSlot = async () => {
        if (!lastSlot) return;
        try {
            await deleteSlot({ project, number: lastSlot.number }).unwrap();
        } catch {
            addToast({ title: "Failed to remove slot", color: "danger", description: `Could not remove ${factionNames[faction]} slot #${lastSlot.number}` });
        }
    };

    return (
        <div className={classNames("relative border border-content3 overflow-hidden")}>
            <div className="absolute -top-8 right-48 flex items-center justify-center pointer-events-none select-none">
                <ThronesIcon name={faction} className={classNames("text-[8rem] sm:text-[10rem]", watermarkClasses[faction])}/>
            </div>
            <div className="relative flex h-20 items-center">
                <div className={classNames("text-2xl sm:text-3xl font-cinzel tracking-widest p-4 flex items-center gap-2 grow", className)} style={style}>
                    {factionNames[faction]}
                </div>
                <div className="flex items-center gap-1 pr-4">
                    <span className="text-small text-default-500 whitespace-nowrap pr-1">{slots.length} {slots.length === 1 ? "slot" : "slots"}</span>
                    {canDeleteSlots && (
                        <Tooltip content={lastSlotIsEmpty ? `Remove last ${factionNames[faction]} slot` : "Cannot remove a slot with cards on it"}>
                            <span tabIndex={0} className="inline-block">
                                <Button isIconOnly size="sm" variant="flat" isDisabled={!lastSlotIsEmpty || isDeletingSlot} onPress={onRemoveSlot}>
                                    <FontAwesomeIcon icon={faMinus}/>
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                    {canCreateSlots && (
                        <Tooltip content={`Add a ${factionNames[faction]} slot`}>
                            <Button isIconOnly size="sm" variant="flat" isLoading={isCreatingSlot} onPress={onAddSlot}>
                                <FontAwesomeIcon icon={faPlus}/>
                            </Button>
                        </Tooltip>
                    )}
                </div>
            </div>
            <div className="relative">
                <div className="w-full h-64 sm:h-72 md:h-80 flex overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden gap-2 p-2">
                    {slots.map((slot, index) => <FactionSlot key={slot.number} slot={slot} zIndex={slots.length - index} onNew={onNew} onSuggestion={onSuggestion} onEdit={onEdit} onDelete={onDelete}/>)}
                </div>
            </div>
        </div>
    );
}
type FactionCarouselProps = Omit<BaseElementProps, "children"> & {
    project: number;
    faction: Faction;
    slots: DraftSlot[];
    onNew: (slot: DraftSlot) => void;
    onSuggestion: (slot: DraftSlot) => void;
    onEdit: (card: IPlaytestCard) => void;
    onDelete: (card: IPlaytestCard) => void;
}

function DroppableSlot({ className, style, slot, children }: DroppableSlotProps) {
    const { setNodeRef, isOver } = useDroppable({ id: `slot-${slot.number}`, data: { faction: slot.faction, number: slot.number } });
    return (
        <div ref={setNodeRef} className={classNames("h-full aspect-[240/333] shrink-0 outline-primary rounded-lg", { "outline-2 outline-dashed outline-offset-2 ": isOver }, className)} style={style}>
            {children}
        </div>
    );
}

type DroppableSlotProps = BaseElementProps & {
    slot: DraftSlot;
}

function DraggableTopCard({ card, slotNumber, children }: { card: IPlaytestCard; slotNumber: number; children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        // Excludes number, which changes on move - the id must survive the optimistic patch so the drop animation can find the card at its destination
        id: `card-${card.project}-${card.created}-${card.version}`,
        data: { card, slotNumber } satisfies DragData
    });
    return (
        <div ref={setNodeRef} {...listeners} {...attributes} className={classNames("h-full touch-manipulation cursor-grab", { "opacity-0": isDragging })}>
            <div className={classNames()}>
                {children}
            </div>
        </div>
    );
}

type DropdownItemDef = {
    key: string;
    label: string;
    group: string;
    icon: IconDefinition;
    onPress: () => void;
    className?: string;
    style?: React.CSSProperties;
};
function FactionSlot({ slot, zIndex, onNew, onSuggestion, onEdit, onDelete }: FactionSlotProps) {
    const [selectedIndex, setSelectedIndex] = useState<number>(Math.max(0, slot.options.length - 1));

    useEffect(() => {
        setSelectedIndex(Math.max(0, slot.options.length - 1));
    }, [slot.options.length]);

    const canEdit = usePermission(Permission.EDIT_CARDS);
    const canDelete = usePermission(Permission.DELETE_CARDS);
    // CardStack renders oldest-first, so selectedIndex maps into the reversed order
    const stackedCards = [...slot.options].reverse();
    const topCard = stackedCards[Math.min(selectedIndex, stackedCards.length - 1)];
    return (
        <DroppableSlot slot={slot} className="relative">
            <div className="absolute inset-0">
                <EmptyCardSlot
                    slot={slot}
                    onNew={() => onNew(slot)}
                    onSuggestion={() => onSuggestion(slot)}
                />
            </div>
            {stackedCards && topCard && (
                <div className="absolute inset-0">
                    <CardStack
                        cards={stackedCards}
                        selectedIndex={selectedIndex}
                        tilt={{ amount: 2, alternate: true, variance: 0.5, animateNew: false }}
                        className="h-full"
                        style={{ zIndex }}
                        onClick={() => setSelectedIndex((prev) => prev === 0 ? slot.options.length - 1 : --prev)}
                    >
                        {
                            (card) => {
                                const dropdownItems: DropdownItemDef[] = [
                                    { key: "new", label: "Add New", group: "Slot Actions", icon: faStarOfLife, onPress: () => onNew(slot) },
                                    { key: "suggestion", label: "Add Suggestion", group: "Slot Actions", icon: faAddressCard, onPress: () => onSuggestion(slot) },
                                    canEdit && { key: "edit", label: "Edit", group: "Card Actions", icon: faPencil, onPress: () => onEdit(card) },
                                    canDelete && { key: "delete", label: "Delete", group: "Card Actions", icon: faTrash, className: "text-danger", onPress: () => onDelete(card) }
                                ].flatMap(item => item ? [item] : []);

                                const groupedItems = groupBy(dropdownItems, item => item.group);

                                const content = (
                                    <div className="size-full relative">
                                        <div className="absolute top-0 right-0 z-1 opacity-25 p-1 hover:opacity-90 transition-opacity">
                                            <Dropdown>
                                                <DropdownTrigger>
                                                    <Button isIconOnly radius="full" size="sm" variant="faded">
                                                        <FontAwesomeIcon icon={faEllipsis}/>
                                                    </Button>
                                                </DropdownTrigger>
                                                <DropdownMenu emptyContent="No actions">
                                                    {Object.entries(groupedItems).map(([group, items]) => (
                                                        <DropdownSection key={group} title={group}>
                                                            {items.map(item => (
                                                                <DropdownItem key={item.key} className={item.className} style={item.style} startContent={<FontAwesomeIcon icon={item.icon}/>} onPress={item.onPress}>
                                                                    {item.label}
                                                                </DropdownItem>
                                                            ))}
                                                        </DropdownSection>
                                                    ))}
                                                </DropdownMenu>
                                            </Dropdown>
                                        </div>
                                        <CardPreview
                                            className="select-none"
                                            card={renderPlaytestingCard(card, { top: "Draft Option", middle: `Card #${slot.number}`, bottom: card.suggestionId ? "From Suggestion" : "New Design" })}
                                        />
                                    </div>
                                );

                                return card === topCard
                                    ? <DraggableTopCard card={card} slotNumber={slot.number}>{content}</DraggableTopCard>
                                    : content;
                            }
                        }
                    </CardStack>
                </div>
            )}
        </DroppableSlot>
    );
}

type FactionSlotProps = {
    slot: DraftSlot;
    zIndex: number;
    onNew: (slot: DraftSlot) => void;
    onSuggestion: (slot: DraftSlot) => void;
    onEdit: (card: IPlaytestCard) => void;
    onDelete: (card: IPlaytestCard) => void;
}

function EmptyCardSlot({ className, style, slot, onNew = () => true, onSuggestion = () => true }: EmptyCardSlotProps) {
    const [isActive, setIsActive] = useState(false);

    return (
        <div className={classNames("relative", className)} style={style}>
            <CardBlank
                className={classNames({ "transition-all duration-200 ease-in-out not-hover:brightness-75 hover:brightness-100": !isActive, "brightness-100": isActive })}
                rounded
                classNames={{ inner:"flex flex-col justify-center items-center border-12 bg-default-100 brightness-50" }}
                styles={{ inner: { borderColor: thronesColors[slot.faction] } }}
                onClick={() => !isActive && setIsActive(true)}
            />
            <div className={classNames("z-0 absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-500", slot.options.length === 0 ? "opacity-100" : "opacity-0")}>
                <RadialMenu className="size-16 sm:size-20 md:size-28 lg:size-32" isOpen={isActive} onOpenChange={setIsActive} classNames={{ button: "h-10 w-10" }}>
                    <PermissionGate requires={Permission.CREATE_CARDS}>
                        <Tooltip content="Create new card">
                            <Button
                                isIconOnly
                                radius="full"
                                variant="flat"
                                color="primary"
                                size="sm"
                                className="shadow-sm text-tiny size-8 md:text-small md:size-10 lg:text-medium lg:size-12"
                                onPress={onNew}
                            >
                                <FontAwesomeIcon icon={faStarOfLife}/>
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
                                className="shadow-sm text-tiny size-8 md:text-small md:size-10 lg:text-medium lg:size-12"
                                onPress={onSuggestion}
                            >
                                <FontAwesomeIcon icon={faAddressCard}/>
                            </Button>
                        </Tooltip>
                    </PermissionGate>
                </RadialMenu>
            </div>
        </div>
    );
};

type EmptyCardSlotProps = Omit<BaseElementProps, "children"> & {
    slot: DraftSlot;
    onNew?: () => void;
    onSuggestion?: () => void;
}
