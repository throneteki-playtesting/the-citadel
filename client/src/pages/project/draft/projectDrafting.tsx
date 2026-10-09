import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useDispatch } from "react-redux";
import { addToast, Skeleton } from "@heroui/react";
import { DndContext, getClientRect, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import classNames from "classnames";
import { Faction, factions, IPlaytestCard } from "common/models/cards";
import { IProject } from "common/models/projects";
import { slotConditionIssues } from "common/models/slotConditions";
import { ISlot, movedOptionVersion, NEW_OPTION_VERSION } from "common/models/slots";
import Permission from "common/models/permissions";
import { parseCardCode } from "common/utils";
import { DeepPartial } from "common/types";
import api, {
    useAddSlotOptionsMutation,
    useAddToPoolMutation,
    useDeleteDraftMutation,
    useGetCardsQuery,
    useGetPoolQuery,
    useGetSlotsQuery,
    useMoveCardMutation,
    useStartSlotDiscussionMutation
} from "../../../api";
import { showApiErrorToast, toNormalizedError } from "../../../api/errors";
import type { AppDispatch } from "../../../api/store";
import { cacheNow } from "../../../api/cacheHelpers";
import SlotOptionsModal from "../../../components/slots/slotOptionsModal";
import { usePermission } from "../../../hooks/usePermission";
import { useDragSensors } from "../../../hooks/useDragSensors";
import { useHasOpened } from "../../../hooks/useHasOpened";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { useTagManagerOverrides } from "../../../hooks/useTagManagerOverrides";
import { CARD_BASE, DRAFT_ROW_HEIGHT_CLASS, HOLD_TOLERANCE_PX, POOL_DROP_START_PATIENCE_MS } from "../../../constants";
import EditCardModal, { EditOrigin } from "../../card/editCardModal";
import DeleteCardModal from "../../card/deleteCardModal";
import SelectSuggestionModal from "./selectSuggestionModal";
import ArrangeModal from "./arrangeModal";
import IncomingCards, { IncomingCard } from "./incomingCards";
import FactionCarousel from "./factionCarousel";
import DraftPool from "./draftPool";
import { useDraftPoolHost } from "./useDraftPoolHost";
import { closeSlotMenus } from "./slotMenuStore";
import DraftDragOverlay from "./draggedCard";
import { collisions } from "./draftCollisions";
import { scrollToSlot } from "./scrollToSlot";
import { createDragStore, DragData, DragStoreContext } from "./draftDragStore";
import {
    buildFactionSlots,
    carryArrivals,
    carryAway,
    carryCard,
    DraftSlot,
    FactionSlots,
    findDraftSlot,
    firstFittingSlot,
    incomingCardFor,
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
        title: card.suggestionId ? "Successfully removed" : "Successfully deleted",
        description: card.suggestionId
            ? `'${card.name}' was removed from slot #${card.number}`
            : `'${card.name}' in slot #${card.number} was deleted`
    })
};

const toastCard = (change: keyof typeof cardToasts, card: IPlaytestCard) =>
    addToast({ color: "success", ...cardToasts[change](card) });

export default function ProjectDrafting({ project }: ProjectDraftingProps) {
    // A board others are working on at the same time - what they change applies as it arrives, rather than waiting on the
    // "new data" toast
    useTagManagerOverrides({ autoRefresh: true });
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
    const [flight, setFlight] = useState<{ slotNumber: number; cards: IncomingCard[]; isWaiting?: boolean }>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();
    const [optionsSlot, setOptionsSlot] = useState<ISlot>();
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [arranging, setArranging] = useState<{ number: number; pile: HTMLElement; isLifted: boolean }>();
    const [dragStore] = useState(createDragStore);
    // dnd-kit scrolls the page back to the card's place before a drop animation, so it can fly home - which a card on
    // its way to the pool is not doing. It is told that card is in view, and so left where the page is
    const measuring = useMemo(
        () => ({
            draggable: {
                measure: (element: HTMLElement) =>
                    dragStore.isReturning()
                        ? { top: 0, left: 0, right: 1, bottom: 1, width: 1, height: 1 }
                        : getClientRect(element, { ignoreTransform: true })
            }
        }),
        [dragStore]
    );
    useEffect(() => closeSlotMenus, []);
    const pileElements = useRef(new Map<number, HTMLElement>());
    const canEditSlots = usePermission(Permission.EDIT_SLOTS);
    const sensors = useDragSensors();
    // The trigger alone - following the request's status would redraw the page twice for every move
    const [moveCard] = useMoveCardMutation({ selectFromResult: NO_RESULT });
    const [addOptions] = useAddSlotOptionsMutation({ selectFromResult: NO_RESULT });
    const [addToPool] = useAddToPoolMutation({ selectFromResult: NO_RESULT });
    const [deleteDraft] = useDeleteDraftMutation({ selectFromResult: NO_RESULT });
    const [startDiscussion] = useStartSlotDiscussionMutation({ selectFromResult: NO_RESULT });
    const poolHost = useDraftPoolHost();
    const canDraft = usePermission(Permission.CREATE_CARDS);
    const { data: pool } = useGetPoolQuery({ project: project.number }, { skip: !canDraft });
    const dispatch = useDispatch<AppDispatch>();

    const [factionSlots, setFactionSlots] = useState<FactionSlots>(new Map());
    const [previousData, setPreviousData] = useState<[typeof cardsData, typeof slotsData]>();
    if (previousData?.[0] !== cardsData || previousData?.[1] !== slotsData) {
        setPreviousData([cardsData, slotsData]);
        setFactionSlots(reuseUnchanged(factionSlots, buildFactionSlots(cardsData?.items, slotsData?.items)));
    }
    const incomingOptions = flight && findDraftSlot(factionSlots, flight.slotNumber)?.options;
    const isFlightReady =
        !!flight &&
        !flight.isWaiting &&
        flight.cards.every(({ card }, rank) => incomingOptions?.[rank]?.version === card.version);
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
    // Cards sent to a slot wait over where they left from while it is scrolled into view, so they never fly off-screen
    const beginFlight = useStableCallback((slotNumber: number, cards: IncomingCard[], hold?: Promise<void>) => {
        setFlight({ slotNumber, cards, isWaiting: true });
        return Promise.all([scrollToSlot(pileElements.current.get(slotNumber)), hold]).then(() =>
            setFlight((current) => (current?.slotNumber === slotNumber ? { ...current, isWaiting: false } : current))
        );
    });
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
            void beginFlight(cards[0].number, incoming);
        }
    });
    const onCardSaved = useStableCallback((card: IPlaytestCard, from?: DOMRect) => {
        const isNew = editing?.version === NEW_OPTION_VERSION;
        toastCard(isNew ? "added" : "saved", card);
        const slot = findDraftSlot(slotsRef.current, card.number);
        if (isNew && from && slot && pileElements.current.has(card.number)) {
            carryArrivals([card]);
            void beginFlight(card.number, [incomingCardFor(card, slot, from, "none")]);
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
    const onStartDiscussion = useStableCallback(async (slot: DraftSlot) => {
        try {
            await startDiscussion({ project: project.number, number: slot.number }).unwrap();
            addToast({
                color: "success",
                title: "Discussion opened",
                description: `Slot #${slot.number} has a thread in the planning forum`
            });
        } catch (error) {
            showApiErrorToast(error, { title: "Failed to open discussion" });
        }
    });
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
        dragStore.clearDrop();
        // Pressing a card focuses it, and anything which then makes the page redraw puts the focus back on it - scrolling
        // the page to where it was picked up, however far it has been carried since
        (document.activeElement as HTMLElement | null)?.blur();
        const data = event.active.data.current as DragData | undefined;
        if (!data) {
            return;
        }
        // On touch, a pick-up let go of without moving arranges the pile instead of moving its card
        const optionCount = findDraftSlot(factionSlots, data.slotNumber)?.options.length ?? 0;
        const isHold = "touches" in event.activatorEvent && canEditSlots && optionCount > 1;
        dragStore.set({ active: data, held: isHold ? data.slotNumber : undefined });
        // A card made from a suggestion which has since been deleted can't go back in the pool - so the pool says so
        // while it is held, rather than accepting a drop which can't happen
        if (data.card.suggestionId && !data.suggestion) {
            const request = dispatch(api.endpoints.getSuggestion.initiate(data.card.suggestionId));
            void request.then((result) => {
                request.unsubscribe();
                // A suggestion which is gone comes back as nothing at all, or as not found
                const isGone = result.isError ? toNormalizedError(result.error).kind === "notFound" : !result.data;
                if (dragStore.get().active === data && isGone) {
                    dragStore.set({ isOrphaned: true });
                }
            });
        }
        if (data.suggestion) {
            dragStore.beginDrop();
            const target = factionSlotFor(data.card.faction, data);
            if (target) {
                void scrollToSlot(pileElements.current.get(target.number));
            }
        }
    };

    const handleDragMove = ({ delta }: DragMoveEvent) => {
        if (dragStore.get().held !== undefined && Math.hypot(delta.x, delta.y) > HOLD_TOLERANCE_PX) {
            dragStore.set({ held: undefined });
        }
    };

    // Where a card dropped on a faction goes - the first slot of it which the card fits
    const factionSlotFor = (faction: Faction | undefined, data: DragData) =>
        faction ? firstFittingSlot(slotsRef.current.get(faction), data.card, data.slotNumber) : undefined;

    const handleDragOver = ({ active, over }: DragOverEvent) => {
        const target = over?.data.current as { faction?: Faction; number?: number } | undefined;
        const data = active.data.current as DragData | undefined;
        if (target?.number !== undefined || !data) {
            dragStore.set({ over: target?.number, overFaction: undefined });
            return;
        }
        const slot = factionSlotFor(target?.faction, data);
        dragStore.set({ over: slot?.number, overFaction: slot && target?.faction });
    };

    const clearDrag = () =>
        dragStore.set({
            active: undefined,
            over: undefined,
            overFaction: undefined,
            isOrphaned: undefined,
            held: undefined
        });

    // A suggestion from the pool goes in as a new option on top, whether or not it suits the slot - which only warns. It
    // flies from where it was let go of - or, tapped, from where it sat in the pool - onto the slot's pile
    const placeFromPool = async (
        data: DragData,
        number: number | undefined,
        tapped?: { from: DOMRect; arrived: Promise<void>; dismiss: () => void }
    ) => {
        const slot = number === undefined ? undefined : findDraftSlot(slotsRef.current, number);
        if (!slot) {
            dragStore.endDrop(false);
            return;
        }
        try {
            const [created] = await addOptions({
                project: project.number,
                number: slot.number,
                cards: [{ ...data.card, number: slot.number, faction: slot.faction }]
            }).unwrap();
            toastCard("added", created);
            const from = tapped?.from ?? dragStore.dropRect();
            if (from && pileElements.current.has(slot.number)) {
                carryArrivals([created]);
                // Tapped, it waits over its place in the pool until the page has scrolled to its slot, and the pool is put away
                void beginFlight(
                    slot.number,
                    [incomingCardFor(created, slot, from, tapped ? "none" : "menu")],
                    tapped?.arrived.then(tapped.dismiss)
                );
                // The copy in flight is drawn over the card in hand before that is let go
                requestAnimationFrame(() => requestAnimationFrame(() => dragStore.endDrop(true)));
            } else {
                tapped?.dismiss();
                dragStore.endDrop(false);
            }
        } catch (error) {
            dragStore.endDrop(false);
            showApiErrorToast(error, { title: "Failed to add suggestion" });
        }
    };

    // A card made from a suggestion, let go over the pool: it is put back in it - pooled first if it never was - and
    // taken out of its slot. It is held where it was let go until that is known, and only then taken in
    const returnToPool = async (card: IPlaytestCard) => {
        const suggestion = card.suggestionId;
        if (!suggestion) {
            dragStore.endDrop(false);
            return;
        }
        try {
            if (!pool?.some((entry) => entry.suggestion === suggestion)) {
                await addToPool({ project: project.number, suggestion, isUnapprovedConfirmed: true }).unwrap();
            }
        } catch (error) {
            dragStore.endDrop(false);
            if (toNormalizedError(error).kind === "notFound") {
                addToast({
                    title: "Can't add to the pool",
                    color: "warning",
                    description: "The suggestion this card was made from no longer exists"
                });
            } else {
                showApiErrorToast(error, { title: "Failed to add to the pool" });
            }
            return;
        }
        const started = dragStore.dropStarted();
        dragStore.endDrop("taken in");
        // Its place in the pile has to stay until the overlay has begun, or there is nothing for it to start from
        await Promise.race([started, new Promise((resolve) => setTimeout(resolve, POOL_DROP_START_PATIENCE_MS))]);
        // The card was let go of - the pile has nothing to toss
        carryAway(card);
        const patchResult = dispatch(
            api.util.updateQueryData("getCards", { filter: { project: project.number, draft: true } }, (draft) => {
                draft.items = draft.items.filter((c) => !(c.number === card.number && c.version === card.version));
            })
        );
        try {
            await deleteDraft(card).unwrap();
            addToast({
                color: "success",
                title: "Returned to the pool",
                description: `'${card.name}' was taken out of slot #${card.number}`
            });
        } catch (error) {
            patchResult.undo();
            showApiErrorToast(error, { title: "Failed to take the card out of its slot" });
        }
    };

    // Tapped in the pool: it goes where dropping it on its faction would put it
    const onPlaceFromPool = useStableCallback((data: DragData, from: DOMRect, dismiss: () => void) => {
        const slot = factionSlotFor(data.card.faction, data);
        if (slot) {
            void placeFromPool(data, slot.number, {
                from,
                arrived: scrollToSlot(pileElements.current.get(slot.number)),
                dismiss
            });
        } else {
            addToast({
                title: "No slot fits",
                color: "warning",
                description: "None of that faction's slots can take a card like this"
            });
        }
    });

    const handleDragEnd = async (event: DragEndEvent) => {
        const releasedHold = dragStore.get().held;
        clearDrag();
        if (releasedHold !== undefined) {
            openArrange(releasedHold);
            return;
        }
        const data = event.active.data.current as DragData | undefined;
        const target = event.over?.data.current as { faction: Faction; number?: number; pool?: boolean } | undefined;
        if (target?.pool && event.over && data && !data.suggestion) {
            dragStore.beginDrop(true);
            await returnToPool(data.card);
            return;
        }
        const toSlot = data && (target?.number ?? factionSlotFor(target?.faction, data)?.number);
        if (data?.suggestion) {
            await placeFromPool(data, toSlot);
            return;
        }
        if (!data || !target || toSlot === undefined || data.slotNumber === toSlot) {
            return;
        }

        const to = toSlot;
        const { card } = data;
        const { faction: toFaction } = target;
        // The version the server will give it, so it never shares an identity with a card already in that slot
        const version = movedOptionVersion(
            card.version,
            (cardsData?.items ?? []).filter((c) => c.number === to).map((c) => c.version)
        );
        if (!version) {
            addToast({
                title: "Failed to move card",
                color: "danger",
                description: `Slot #${to} has no room left`
            });
            return;
        }
        void scrollToSlot(pileElements.current.get(to));
        carryCard(card, { number: to, version });
        const patchResult = dispatch(
            api.util.updateQueryData("getCards", { filter: { project: project.number, draft: true } }, (draft) => {
                const patchTarget = draft.items.find((c) => c.number === card.number && c.version === card.version);
                if (patchTarget) {
                    patchTarget.number = to;
                    patchTarget.version = version;
                    patchTarget.faction = toFaction;
                    patchTarget.updated = cacheNow();
                }
            })
        );

        try {
            await moveCard({
                project: project.number,
                number: card.number,
                version: card.version,
                to: to
            }).unwrap();
        } catch {
            patchResult.undo();
            addToast({
                title: "Failed to move card",
                color: "danger",
                description: `'${card.name}' could not be moved to slot #${to}`
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
                collisionDetection={collisions}
                measuring={measuring}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                    clearDrag();
                    dragStore.endDrop(false);
                }}
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
                            onStartDiscussion={onStartDiscussion}
                            registerPile={registerPile}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
                {canDraft && (
                    <DraftPool
                        project={project.number}
                        used={usedSuggestions}
                        host={poolHost}
                        onPlace={onPlaceFromPool}
                    />
                )}
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
