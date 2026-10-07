import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useDispatch } from "react-redux";
import { addToast, Skeleton } from "@heroui/react";
import { DndContext, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import classNames from "classnames";
import { Faction, factions, IPlaytestCard } from "common/models/cards";
import { IProject } from "common/models/projects";
import { slotConditionIssues } from "common/models/slotConditions";
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
import { useHasOpened } from "../../../hooks/useHasOpened";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { CARD_BASE, DRAFT_ROW_HEIGHT_CLASS, HOLD_TOLERANCE_PX } from "../../../constants";
import EditCardModal, { EditOrigin } from "../../card/editCardModal";
import DeleteCardModal from "../../card/deleteCardModal";
import SelectSuggestionModal from "./selectSuggestionModal";
import ArrangeModal from "./arrangeModal";
import IncomingCards, { IncomingCard } from "./incomingCards";
import FactionCarousel from "./factionCarousel";
import { closeSlotMenus } from "./slotMenuStore";
import DraftDragOverlay from "./draggedCard";
import { createDragStore, DragData, DragStoreContext } from "./draftDragStore";
import {
    buildFactionSlots,
    carryArrivals,
    carryCard,
    DraftSlot,
    FactionSlots,
    findDraftSlot,
    isUprightPlot,
    releaseArrivals,
    reuseUnchanged
} from "./draftSlots";

const NO_RESULT = () => ({});

// A pile's width as a vertical card would have it - a plot-only pile lies on its side, so its height is that
const portraitWidth = (pile?: HTMLElement) => (pile ? Math.min(pile.clientWidth, pile.clientHeight) : undefined);

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
    const { data: slotsData, isLoading: isLoadingSlots } = useGetSlotsQuery({ project: project.number });

    const [editing, setEditing] = useState<DeepPartial<IPlaytestCard>>();
    // Where an edited card sat in its stack, so it can be carried from there to the editor
    const [editingOrigin, setEditingOrigin] = useState<EditOrigin>();
    const [editingWidth, setEditingWidth] = useState<number>();
    const [suggesting, setSuggesting] = useState<{
        slot: ISlot;
        hasNonPlot: boolean;
        cardWidth: number;
        isOpen: boolean;
    }>();
    // Suggestions just added fly in from the modal to the pile, which holds them unseen until they land
    const [flight, setFlight] = useState<{ slotNumber: number; cards: IncomingCard[] }>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();
    const [optionsSlot, setOptionsSlot] = useState<ISlot>();
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [arranging, setArranging] = useState<{ number: number; pile: HTMLElement; isLifted: boolean }>();
    const [dragStore] = useState(createDragStore);
    useEffect(() => closeSlotMenus, []);
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
    const incomingOptions = flight && findDraftSlot(factionSlots, flight.slotNumber)?.options;
    const isFlightReady =
        !!flight && flight.cards.every(({ card }, rank) => incomingOptions?.[rank]?.version === card.version);
    const slotsRef = useRef(factionSlots);
    slotsRef.current = factionSlots;
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
        (slot: DraftSlot) => {
            setEditingOrigin(undefined);
            setEditingWidth(portraitWidth(pileElements.current.get(slot.number)));
            setEditing({
                project: project.number,
                number: slot.number,
                code: parseCardCode(false, project.number, slot.number),
                faction: slot.faction,
                version: NEW_OPTION_VERSION
            });
        },
        [project.number]
    );
    const onSuggestion = useCallback(
        (slot: DraftSlot) =>
            setSuggesting({
                slot: slot.slot,
                hasNonPlot: slot.options.some((card) => card.type !== "plot"),
                cardWidth: portraitWidth(pileElements.current.get(slot.number)) ?? CARD_BASE.width,
                isOpen: true
            }),
        []
    );
    const onSuggestionsAdded = useStableCallback((cards: IPlaytestCard[], incoming?: IncomingCard[]) => {
        if (cards.length === 1) {
            toastCard("added", cards[0]);
        } else {
            addToast({
                color: "success",
                title: "Successfully added",
                description: `${cards.length} suggestions were added to slot #${cards[0].number}`
            });
        }
        if (incoming && pileElements.current.has(cards[0].number)) {
            carryArrivals(cards);
            setFlight({ slotNumber: cards[0].number, cards: incoming });
        }
    });
    const onCardSaved = useStableCallback((card: IPlaytestCard, from?: DOMRect) => {
        const isNew = editing?.version === NEW_OPTION_VERSION;
        toastCard(isNew ? "added" : "saved", card);
        const slot = findDraftSlot(slotsRef.current, card.number);
        if (isNew && from && slot && pileElements.current.has(card.number)) {
            carryArrivals([card]);
            setFlight({
                slotNumber: card.number,
                cards: [
                    {
                        card,
                        rank: 0,
                        from,
                        isFromUpright: false,
                        isUpright: isUprightPlot(
                            card,
                            card.type !== "plot" || slot.options.some((option) => option.type !== "plot")
                        ),
                        issues: slotConditionIssues(slot.slot.conditions, card, true),
                        fromControl: "none"
                    }
                ]
            });
        }
    });
    const onFlightDone = useStableCallback(() => {
        if (flight) {
            releaseArrivals(flight.cards.map(({ card }) => card));
        }
        setFlight(undefined);
    });
    const onCloseEditor = useCallback(() => setEditing(undefined), []);
    const onCloseSuggestions = useCallback(
        () => setSuggesting((current) => current && { ...current, isOpen: false }),
        []
    );
    const onArrangeLifted = useCallback(() => setArranging((current) => current && { ...current, isLifted: true }), []);
    const onArrangeClosed = useCallback(() => setArranging(undefined), []);
    // Mounted once first wanted, and kept so each can fade out
    const hasOpenedEditor = useHasOpened(!!editing);
    const usedSuggestions = useMemo(
        () =>
            new Map(
                (cardsData?.items ?? []).flatMap((card) =>
                    card.suggestionId ? [[card.suggestionId, card.number] as const] : []
                )
            ),
        [cardsData]
    );
    const onArrange = useCallback((slot: DraftSlot) => openArrange(slot.number), [openArrange]);
    const onEditOptions = useCallback((slot: DraftSlot) => {
        setOptionsSlot(slot.slot);
        setIsOptionsOpen(true);
    }, []);
    const onEdit = useCallback((card: IPlaytestCard) => {
        const slot = findDraftSlot(slotsRef.current, card.number);
        const rank = slot?.options.findIndex((option) => option.version === card.version) ?? -1;
        const node =
            slot && rank >= 0
                ? pileElements.current
                      .get(card.number)
                      ?.querySelector<HTMLElement>(`[data-stack-index="${slot.options.length - 1 - rank}"]`)
                : undefined;
        setEditingOrigin(
            slot && node
                ? {
                      card,
                      rank,
                      slotNumber: slot.number,
                      isUpright: isUprightPlot(
                          card,
                          slot.options.some((option) => option.type !== "plot")
                      ),
                      issues: slotConditionIssues(slot.slot.conditions, card),
                      from: node.getBoundingClientRect(),
                      source: node
                  }
                : undefined
        );
        setEditingWidth(undefined);
        setEditing(card);
    }, []);
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
                            faction={faction}
                            slots={slots}
                            totalSlots={slotsData?.items.length ?? 0}
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
                {hasOpenedEditor && (
                    <EditCardModal
                        isOpen={!!editing}
                        card={editing}
                        origin={editingOrigin}
                        stackWidth={editingWidth}
                        conditions={
                            editing?.number === undefined
                                ? undefined
                                : findDraftSlot(factionSlots, editing.number)?.slot.conditions
                        }
                        onClose={onCloseEditor}
                        onSave={onCardSaved}
                    />
                )}
                {suggesting && (
                    <SelectSuggestionModal
                        isOpen={suggesting.isOpen}
                        project={project.number}
                        slot={suggesting.slot}
                        hasNonPlot={suggesting.hasNonPlot}
                        cardWidth={suggesting.cardWidth}
                        used={usedSuggestions}
                        onClose={onCloseSuggestions}
                        onSave={onSuggestionsAdded}
                    />
                )}
                {flight && pileElements.current.has(flight.slotNumber) && (
                    <IncomingCards
                        cards={flight.cards}
                        pile={pileElements.current.get(flight.slotNumber)!}
                        isReady={isFlightReady}
                        onDone={onFlightDone}
                    />
                )}
                <SlotOptionsModal isOpen={isOptionsOpen} slot={optionsSlot} onClose={() => setIsOptionsOpen(false)} />
                {arranging && arrangingSlot && (
                    <ArrangeModal
                        project={project.number}
                        slot={arrangingSlot}
                        pile={arranging.pile}
                        onLifted={onArrangeLifted}
                        onClosed={onArrangeClosed}
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
