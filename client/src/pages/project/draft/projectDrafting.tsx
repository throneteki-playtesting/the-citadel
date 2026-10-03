import { useCallback, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { addToast, Skeleton } from "@heroui/react";
import { DndContext, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import classNames from "classnames";
import { Faction, factions, IPlaytestCard } from "common/models/cards";
import { IProject } from "common/models/projects";
import { ISlot, movedOptionVersion, NEW_OPTION_VERSION } from "common/models/slots";
import Permission from "common/models/permissions";
import { parseCardCode } from "common/utils";
import { DeepPartial } from "common/types";
import api, { useGetCardsQuery, useGetSlotsQuery, useMoveCardMutation } from "../../../api";
import type { AppDispatch } from "../../../api/store";
import { cacheNow } from "../../../api/cacheHelpers";
import SlotOptionsModal from "../../../components/slots/slotOptionsModal";
import { usePermission } from "../../../hooks/usePermission";
import { useDragSensors } from "../../../hooks/useDragSensors";
import { DRAFT_ROW_HEIGHT_CLASS, HOLD_TOLERANCE_PX } from "../../../constants";
import EditCardModal from "../../card/editCardModal";
import DeleteCardModal from "../../card/deleteCardModal";
import SelectSuggestionModal from "./selectSuggestionModal";
import ArrangeModal from "./arrangeModal";
import FactionCarousel from "./factionCarousel";
import DraftDragOverlay from "./draggedCard";
import { createDragStore, DragData, DragStoreContext } from "./draftDragStore";
import { buildFactionSlots, carryCard, DraftSlot, FactionSlots, findDraftSlot, reuseUnchanged } from "./draftSlots";

const NO_RESULT = () => ({});

const cardToasts = {
    added: (card: IPlaytestCard) => ({
        title: "Successfully added",
        description: `'${card.name}' was added to slot #${card.number}`
    }),
    saved: (card: IPlaytestCard) => ({
        title: "Successfully saved",
        description: `'${card.name}' in slot #${card.number} was saved`
    }),
    deleted: (card: IPlaytestCard) => ({
        title: "Successfully deleted",
        description: `'${card.name}' was removed from slot #${card.number}`
    })
};

const toastCard = (change: keyof typeof cardToasts, card: IPlaytestCard) =>
    addToast({ color: "success", ...cardToasts[change](card) });

export default function ProjectDrafting({ project }: ProjectDraftingProps) {
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({
        filter: { project: project.number, draft: true }
    });
    const {
        data: slotsData,
        isLoading: isLoadingSlots,
        isFetching: isFetchingSlots
    } = useGetSlotsQuery({ project: project.number });

    const [editing, setEditing] = useState<DeepPartial<IPlaytestCard>>();
    const [suggesting, setSuggesting] = useState<{ faction: Faction; number: number }>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();
    const [optionsSlot, setOptionsSlot] = useState<ISlot>();
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [arranging, setArranging] = useState<{ number: number; pile: HTMLElement; isLifted: boolean }>();
    const [dragStore] = useState(createDragStore);
    const pileElements = useRef(new Map<number, HTMLElement>());
    const canEditSlots = usePermission(Permission.EDIT_SLOTS);
    const sensors = useDragSensors();
    // The trigger alone - following the request's status would redraw the page twice for every move
    const [moveCard] = useMoveCardMutation({ selectFromResult: NO_RESULT });
    const dispatch = useDispatch<AppDispatch>();

    const [factionSlots, setFactionSlots] = useState<FactionSlots>(new Map());
    const [previousData, setPreviousData] = useState<[typeof cardsData, typeof slotsData]>();
    if (previousData?.[0] !== cardsData || previousData?.[1] !== slotsData) {
        setPreviousData([cardsData, slotsData]);
        setFactionSlots(reuseUnchanged(factionSlots, buildFactionSlots(cardsData?.items, slotsData?.items)));
    }
    const arrangingSlot = arranging && findDraftSlot(factionSlots, arranging.number);

    // Stable, so the memoised slots only redraw when their own data changes
    const registerPile = useCallback((number: number, element: HTMLElement | null) => {
        if (element) {
            pileElements.current.set(number, element);
        } else {
            pileElements.current.delete(number);
        }
    }, []);
    const openArrange = useCallback((number: number) => {
        const pile = pileElements.current.get(number);
        if (pile) {
            setArranging({ number, pile, isLifted: false });
        }
    }, []);
    const onNew = useCallback(
        (slot: DraftSlot) =>
            setEditing({
                project: project.number,
                number: slot.number,
                code: parseCardCode(false, project.number, slot.number),
                faction: slot.faction,
                version: NEW_OPTION_VERSION
            }),
        [project.number]
    );
    const onSuggestion = useCallback(
        (slot: DraftSlot) => setSuggesting({ faction: slot.faction, number: slot.number }),
        []
    );
    const onArrange = useCallback((slot: DraftSlot) => openArrange(slot.number), [openArrange]);
    const onEditOptions = useCallback((slot: DraftSlot) => {
        setOptionsSlot(slot.slot);
        setIsOptionsOpen(true);
    }, []);
    const onEdit = useCallback((card: IPlaytestCard) => setEditing(card), []);
    const onDelete = useCallback((card: IPlaytestCard) => setDeleting(card), []);

    const handleDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as DragData | undefined;
        if (!data) {
            return;
        }
        // On touch, a pick-up let go of without moving arranges the pile instead of moving its card
        const optionCount = findDraftSlot(factionSlots, data.slotNumber)?.options.length ?? 0;
        const isHold = "touches" in event.activatorEvent && canEditSlots && optionCount > 1;
        dragStore.set({ active: data, held: isHold ? data.slotNumber : undefined });
    };

    const handleDragMove = ({ delta }: DragMoveEvent) => {
        if (dragStore.get().held !== undefined && Math.hypot(delta.x, delta.y) > HOLD_TOLERANCE_PX) {
            dragStore.set({ held: undefined });
        }
    };

    const handleDragOver = ({ over }: DragOverEvent) => {
        dragStore.set({ over: (over?.data.current as { number: number } | undefined)?.number });
    };

    const clearDrag = () => dragStore.set({ active: undefined, over: undefined, held: undefined });

    const handleDragEnd = async (event: DragEndEvent) => {
        const releasedHold = dragStore.get().held;
        clearDrag();
        if (releasedHold !== undefined) {
            openArrange(releasedHold);
            return;
        }
        const data = event.active.data.current as DragData | undefined;
        const target = event.over?.data.current as { faction: Faction; number: number } | undefined;
        if (!data || !target || data.slotNumber === target.number) {
            return;
        }

        const { card } = data;
        // The version the server will give it, so it never shares an identity with a card already in that slot
        const version = movedOptionVersion(
            card.version,
            (cardsData?.items ?? []).filter((c) => c.number === target.number).map((c) => c.version)
        );
        if (!version) {
            addToast({
                title: "Failed to move card",
                color: "danger",
                description: `Slot #${target.number} has no room left`
            });
            return;
        }
        carryCard(card, { number: target.number, version });
        const patchResult = dispatch(
            api.util.updateQueryData("getCards", { filter: { project: project.number, draft: true } }, (draft) => {
                const patchTarget = draft.items.find((c) => c.number === card.number && c.version === card.version);
                if (patchTarget) {
                    patchTarget.number = target.number;
                    patchTarget.version = version;
                    patchTarget.faction = target.faction;
                    patchTarget.updated = cacheNow();
                }
            })
        );

        try {
            await moveCard({
                project: project.number,
                number: card.number,
                version: card.version,
                to: target.number
            }).unwrap();
        } catch {
            patchResult.undo();
            addToast({
                title: "Failed to move card",
                color: "danger",
                description: `'${card.name}' could not be moved to slot #${target.number}`
            });
        }
    };

    if (isLoadingCards || isLoadingSlots) {
        return (
            <div className="space-y-2">
                {factions.map((faction) => (
                    <Skeleton key={faction} className={classNames("w-full rounded-md", DRAFT_ROW_HEIGHT_CLASS)} />
                ))}
            </div>
        );
    }

    return (
        <DragStoreContext.Provider value={dragStore}>
            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={clearDrag}
            >
                <div className="flex flex-col gap-2">
                    {[...factionSlots.entries()].map(([faction, slots]) => (
                        <FactionCarousel
                            key={faction}
                            project={project.number}
                            faction={faction}
                            slots={slots}
                            totalSlots={slotsData?.items.length ?? 0}
                            isSlotsFetching={isFetchingSlots}
                            arrangingNumber={arranging?.number}
                            isLifted={!!arranging?.isLifted}
                            onNew={onNew}
                            onSuggestion={onSuggestion}
                            onArrange={onArrange}
                            onEditOptions={onEditOptions}
                            registerPile={registerPile}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
                <DraftDragOverlay factionSlots={factionSlots} onEdit={onEdit} onDelete={onDelete} />
                <EditCardModal
                    isOpen={!!editing}
                    card={editing}
                    onClose={() => setEditing(undefined)}
                    onSave={(card) => toastCard(editing?.version === NEW_OPTION_VERSION ? "added" : "saved", card)}
                />
                <SelectSuggestionModal
                    isOpen={!!suggesting}
                    project={project.number}
                    number={suggesting?.number ?? 0}
                    faction={suggesting?.faction}
                    unselectable={cardsData?.items
                        .filter((card) => card.faction === suggesting?.faction && card.suggestionId)
                        .map((card) => card.suggestionId!)}
                    onClose={() => setSuggesting(undefined)}
                    onSave={(card) => toastCard("added", card)}
                />
                <SlotOptionsModal isOpen={isOptionsOpen} slot={optionsSlot} onClose={() => setIsOptionsOpen(false)} />
                {arranging && arrangingSlot && (
                    <ArrangeModal
                        project={project.number}
                        slot={arrangingSlot}
                        pile={arranging.pile}
                        onLifted={() => setArranging((current) => current && { ...current, isLifted: true })}
                        onClosed={() => setArranging(undefined)}
                    />
                )}
                <DeleteCardModal
                    isOpen={!!deleting}
                    card={deleting}
                    onClose={() => setDeleting(undefined)}
                    onDelete={(card) => toastCard("deleted", card)}
                />
            </DndContext>
        </DragStoreContext.Provider>
    );
}

type ProjectDraftingProps = { project: IProject };
