import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import classNames from "classnames";
import { addToast, Button, Skeleton, Tooltip } from "@heroui/react";
import { DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, DropAnimation, MeasuringStrategy, MouseSensor, TouchSensor, useDndContext, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { IPlaytestCard } from "common/models/cards";
import { IProject, IProjectRelease } from "common/models/projects";
import { useGetCardsQuery, useGetSlotsQuery, useReorderReleasesMutation } from "../../../api";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import EditReleaseModal from "./editReleaseModal";
import PermissionGate from "../../../components/permissionGate";
import CapsuleVisual from "./capsuleVisual";
import DevelopmentOverlay, { DevelopmentPoolButton } from "./developmentOverlay";
import { ReleaseBlock, ReleaseBlockOverlay, ReleaseBlockProps, SortableReleaseBlock } from "./releaseBlock";
import { buildContainers, codeFromReorderItemId, createDropAnimation, createPoolAwareCollisionDetection, findContainer, findNextAvailableIndex, HOVER_EXPAND_DELAY, isFactionCompatible, normalizeDroppableId, POOL_ID, reorderItemId, slotNumberFromItemId, withHover } from "./releaseDnd";
import { useCapsuleFlip } from "./releaseFlip";
import { useCommitMove } from "./useCommitMove";
import { DeepPartial } from "common/types";
import { getPositionFaction } from "common/utils";
import SectionTitle from "../../../components/sectionTitle";
import { highlightTarget } from "../../../constants";

export default function CycleReleases({ project }: CycleReleasesProps) {
    const { data: slotsData, isLoading: isLoadingSlots } = useGetSlotsQuery({ project: project.number });
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: { project: project.number, latest: true } });

    const [reorderReleases] = useReorderReleasesMutation();
    const canEditReleases = usePermission(Permission.EDIT_RELEASES);
    const canDeleteReleases = usePermission(Permission.DELETE_RELEASES);
    const canEditSlots = usePermission(Permission.EDIT_SLOTS);
    // Moving capsules touches both the slot and the release - see server-side PATCH /slots/:slot/release
    const canMoveCapsules = canEditSlots && canEditReleases;

    const [editing, setEditing] = useState<DeepPartial<IProjectRelease>>();
    const [activeId, setActiveId] = useState<string>();
    const [overId, setOverId] = useState<string>();
    // Starts closed to a bubble/button so the floating overlay doesn't cover content on load
    const [isPoolOpen, setIsPoolOpen] = useState(false);
    // Captured from the trigger's DOM rect on open, so the modal can morph in/out from wherever it was clicked
    const [poolOriginRect, setPoolOriginRect] = useState<DOMRect>();
    const [collapsedReleases, setCollapsedReleases] = useState<Set<string>>(new Set());
    const hasInitializedCollapse = useRef(false);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const lastHoverContainerRef = useRef<string>(undefined);
    // Set synchronously in handleDragEnd, before dnd-kit reads it to pick the drop-flight animation
    const isPoolDropRef = useRef(false);
    const poolDropAnimation = useMemo(() => createDropAnimation(() => isPoolDropRef.current), []);
    // Refreshed every render, not just at drag-end - collision detection needs this live, mid-drag
    const poolStateRef = useRef<{ isOpen: boolean, poolItemIds: Set<string> }>({ isOpen: false, poolItemIds: new Set() });
    const poolAwareCollisionDetection = useMemo(() => createPoolAwareCollisionDetection(() => poolStateRef.current), []);
    const captureFlip = useCapsuleFlip();
    const { state: locationState } = useLocation();
    // Tabs don't unmount when inactive, but portalled content (the floating pool overlay) escapes
    // the inactive panel's hidden styling - gate it explicitly so it doesn't float over Development
    const [searchParams] = useSearchParams();
    const isReleasesTabActive = searchParams.get("tab") === "releases";

    // TouchSensor (unlike PointerSensor) preventDefaults touchmove during a drag, so chips can use touch-manipulation without blocking page scroll otherwise
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
    );

    const cardsByNumber = useMemo(() => new Map((cardsData?.items ?? []).map((card) => [card.number, card])), [cardsData]);
    const slots = useMemo(() => slotsData?.items ?? [], [slotsData]);
    const pool = useMemo(() => slots.filter((slot) => !slot.release).sort((a, b) => a.number - b.number), [slots]);
    const releases = useMemo(() => [...project.releases].sort((a, b) => a.number - b.number), [project.releases]);
    const unreleasedReleases = useMemo(() => releases.filter((release) => !release.releasedDate), [releases]);

    // Rendered order lives in local state so a drop commits synchronously; re-syncs from the server's order when codes don't match
    const [orderedCodes, setOrderedCodes] = useState<string[]>([]);
    useEffect(() => {
        setOrderedCodes(unreleasedReleases.map((release) => release.code));
    }, [unreleasedReleases]);
    const orderedUnreleased = useMemo(() => {
        const byCode = new Map(unreleasedReleases.map((release) => [release.code, release]));
        const ordered = orderedCodes.map((code) => byCode.get(code)).filter((release): release is IProjectRelease => !!release);
        return ordered.length === unreleasedReleases.length ? ordered : unreleasedReleases;
    }, [orderedCodes, unreleasedReleases]);
    const nextPublishableCode = orderedUnreleased[0]?.code;

    const filledCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const slot of slots) {
            if (slot.release) {
                counts.set(slot.release.code, (counts.get(slot.release.code) ?? 0) + 1);
            }
        }
        return counts;
    }, [slots]);

    const poolCount = pool.length;
    // Capacity is reserved the moment a release exists, whether or not it's filled yet
    const isAtSlotCapacity = useMemo(
        () => releases.reduce((sum, release) => sum + release.capacity, 0) >= slots.length,
        [releases, slots]
    );

    // Collapse released zones by default, once (further toggles are left to the user)
    useEffect(() => {
        if (hasInitializedCollapse.current || isLoadingSlots || isLoadingCards) {
            return;
        }
        hasInitializedCollapse.current = true;
        // A release deep-linked via ?tab=releases + highlight state should start expanded, even if released
        const highlightedCode = releases.find((release) => locationState?.highlight === highlightTarget.release(project.number, release.code))?.code;
        const defaults = new Set<string>();
        for (const release of releases) {
            if (release.releasedDate && release.code !== highlightedCode) {
                defaults.add(release.code);
            }
        }
        setCollapsedReleases(defaults);
    }, [isLoadingSlots, isLoadingCards, releases, locationState, project.number]);

    const baseContainers = useMemo(() => buildContainers(pool, releases, slots), [pool, releases, slots]);
    const containers = useMemo(
        () => (activeId && overId ? withHover(baseContainers, activeId, overId) : baseContainers),
        [baseContainers, activeId, overId]
    );
    poolStateRef.current = { isOpen: isPoolOpen, poolItemIds: new Set(baseContainers[POOL_ID] ?? []) };

    const activeSlotNumber = activeId ? slotNumberFromItemId(activeId) : undefined;
    const activeCard = activeSlotNumber !== undefined ? cardsByNumber.get(activeSlotNumber) : undefined;
    const activeReorderCode = activeId ? codeFromReorderItemId(activeId) : undefined;
    const activeReorderRelease = activeReorderCode ? releases.find((release) => release.code === activeReorderCode) : undefined;
    const isReorderDragging = !!activeReorderCode;

    const clearHoverTimer = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = undefined;
        }
    };

    const resetDragState = () => {
        clearHoverTimer();
        lastHoverContainerRef.current = undefined;
        setActiveId(undefined);
        setOverId(undefined);
    };

    const openPool = (rect: DOMRect) => {
        setPoolOriginRect(rect);
        setIsPoolOpen(true);
    };
    const closePool = () => setIsPoolOpen(false);

    const toggleReleaseCollapse = (code: string) => setCollapsedReleases((prev) => {
        const next = new Set(prev);
        if (next.has(code)) {
            next.delete(code);
        } else {
            next.add(code);
        }
        return next;
    });

    const commitMove = useCommitMove(project.number, captureFlip);

    const handleDragStart = (event: DragStartEvent) => {
        const id = String(event.active.id);
        setActiveId(id);
        if (codeFromReorderItemId(id) !== undefined) {
            // Reordering collapses every release for the duration - and leaves them collapsed after
            setCollapsedReleases(new Set(releases.map((release) => release.code)));
        } else {
            closePool();
        }
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (codeFromReorderItemId(String(active.id)) !== undefined) {
            return;
        }

        // withHover can make over === active without the pointer moving - reverting would loop forever
        if (over && String(over.id) === String(active.id)) {
            return;
        }

        const overIdStr = over ? normalizeDroppableId(String(over.id)) : undefined;
        const overContainer = overIdStr ? findContainer(containers, overIdStr) : undefined;
        setOverId(overIdStr);

        if (overContainer !== lastHoverContainerRef.current) {
            lastHoverContainerRef.current = overContainer;
            clearHoverTimer();
            if (overContainer && overContainer !== POOL_ID && collapsedReleases.has(overContainer)) {
                hoverTimerRef.current = setTimeout(() => {
                    setCollapsedReleases((prev) => {
                        const next = new Set(prev);
                        next.delete(overContainer);
                        return next;
                    });
                }, HOVER_EXPAND_DELAY);
            }
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        resetDragState();
        isPoolDropRef.current = false;

        const activeIdStr = String(active.id);

        const activeReorderCode = codeFromReorderItemId(activeIdStr);
        if (activeReorderCode !== undefined) {
            const overReorderCode = over ? codeFromReorderItemId(String(over.id)) : undefined;
            if (!overReorderCode || overReorderCode === activeReorderCode) {
                return;
            }
            const codes = orderedUnreleased.map((release) => release.code);
            const oldIndex = codes.indexOf(activeReorderCode);
            const newIndex = codes.indexOf(overReorderCode);
            if (oldIndex === -1 || newIndex === -1) {
                return;
            }
            const newCodes = arrayMove(codes, oldIndex, newIndex);
            setOrderedCodes(newCodes);
            try {
                await reorderReleases({ project: project.number, codes: newCodes }).unwrap();
            } catch {
                setOrderedCodes(codes);
                addToast({ title: "Failed to reorder", color: "danger", description: "Releases could not be reordered" });
            }
            return;
        }

        const slotNumber = slotNumberFromItemId(activeIdStr);
        if (slotNumber === undefined) {
            return;
        }

        const trueContainer = findContainer(baseContainers, activeIdStr);
        if (!trueContainer) {
            return;
        }
        const trueIndex = baseContainers[trueContainer].indexOf(activeIdStr);

        // Default: a cancelled/no-op return below leaves the card where it started - overridden once a real destination is resolved
        isPoolDropRef.current = trueContainer === POOL_ID;

        // withHover's preview may already be the final arrangement - trust live state over `over`
        const liveContainer = findContainer(containers, activeIdStr);
        const liveIndex = liveContainer ? containers[liveContainer].indexOf(activeIdStr) : -1;
        const hasLiveMove = !!liveContainer && (liveContainer !== trueContainer || liveIndex !== trueIndex);

        let code: string | null;
        let position: number | undefined;
        if (hasLiveMove) {
            code = liveContainer === POOL_ID ? null : liveContainer!;
            position = liveContainer === POOL_ID ? undefined : liveIndex + 1;
        } else {
            if (!over) {
                return;
            }
            const overIdStr = normalizeDroppableId(String(over.id));
            if (overIdStr === activeIdStr) {
                return;
            }
            const overContainer = findContainer(baseContainers, overIdStr);
            if (!overContainer) {
                return;
            }
            if (trueContainer === POOL_ID && overContainer === POOL_ID) {
                return;
            }
            if (overContainer === POOL_ID) {
                code = null;
                position = undefined;
            } else {
                code = overContainer;
                const targetRelease = releases.find((release) => release.code === overContainer);
                const overIndex = baseContainers[overContainer].indexOf(overIdStr);
                // Faction-compatible (empty or occupied - occupied is a swap) is a direct target; else falls back below
                const isDirectValidTarget = overIndex !== -1 && isFactionCompatible(getPositionFaction(targetRelease?.slots, overIndex + 1), activeCard?.faction);

                let resolvedIndex: number;
                if (isDirectValidTarget) {
                    resolvedIndex = overIndex;
                } else {
                    // Landing on your OWN release this way is a no-op, not a bump to the next slot
                    if (overContainer === trueContainer) {
                        return;
                    }
                    resolvedIndex = findNextAvailableIndex(baseContainers[overContainer], targetRelease?.slots, activeCard?.faction);
                    if (resolvedIndex === -1) {
                        return;
                    }
                }
                position = resolvedIndex + 1;
            }
        }

        const originalSlot = slots.find((s) => s.number === slotNumber);

        // Positions are faction-locked - silently ignore drops onto another faction's slots
        if (code !== null) {
            const targetRelease = releases.find((release) => release.code === code);
            const positionFaction = getPositionFaction(targetRelease?.slots, position!);
            if (positionFaction && originalSlot && positionFaction !== originalSlot.faction) {
                return;
            }
        }

        const unchanged = code === null
            ? !originalSlot?.release
            : originalSlot?.release?.code === code && originalSlot.release.position === position;
        isPoolDropRef.current = code === null;
        if (unchanged) {
            return;
        }

        await commitMove(slotNumber, code, position);
    };

    const releaseBlockProps = (release: IProjectRelease): ReleaseBlockProps => ({
        project,
        release,
        itemIds: containers[release.code] ?? [],
        cardsByNumber,
        canEditReleases,
        canDeleteReleases,
        canMoveCapsules,
        isCollapsed: collapsedReleases.has(release.code),
        onToggleCollapse: () => toggleReleaseCollapse(release.code),
        onEdit: () => setEditing(release),
        publishBlockedBy: !release.releasedDate && release.code !== nextPublishableCode ? nextPublishableCode : undefined,
        isReorderDragging
    });

    if (isLoadingSlots || isLoadingCards) {
        return (
            <div className="space-y-2">
                <Skeleton className="w-full h-32 rounded-md"/>
                {releases.map((release) => <Skeleton key={release.code} className="w-full h-48 rounded-md"/>)}
            </div>
        );
    }

    return (
        <DndContext sensors={sensors} collisionDetection={poolAwareCollisionDetection} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={resetDragState}>
            <div className="flex flex-col gap-2">
                <div className="text-sm text-foreground/50">
                    {canMoveCapsules
                        ? "Drag cards between the development pool and release packs to plan each release. Publishing a pack locks its contents permanently."
                        : "This page shows the current plans for releasing cards in this project. Planned dates are indicative and may change."}
                </div>
                {canMoveCapsules && isReleasesTabActive && (
                    <DevelopmentOverlay
                        itemIds={containers[POOL_ID] ?? []}
                        count={poolCount}
                        cardsByNumber={cardsByNumber}
                        isOpen={isPoolOpen}
                        onOpen={openPool}
                        onClose={closePool}
                        originRect={poolOriginRect}
                    />
                )}
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <SectionTitle size="lg" className="flex-1">Releases</SectionTitle>
                        {canMoveCapsules && (
                            <DevelopmentPoolButton count={poolCount} isOpen={isPoolOpen} onOpen={openPool}/>
                        )}
                        <PermissionGate requires={Permission.CREATE_RELEASES}>
                            <Tooltip content={isAtSlotCapacity ? "Every card slot in the project is already covered by a release" : undefined} isDisabled={!isAtSlotCapacity}>
                                <span tabIndex={isAtSlotCapacity ? 0 : undefined} className="hidden sm:inline-block">
                                    <Button size="sm" color="primary" isDisabled={isAtSlotCapacity} startContent={<FontAwesomeIcon icon={faPlus}/>} onPress={() => setEditing({})}>
                                        Add Release
                                    </Button>
                                </span>
                            </Tooltip>
                            {/* Floating add button for mobile only */}
                            <Tooltip content={isAtSlotCapacity ? "Every card slot in the project is already covered by a release" : undefined} isDisabled={!isAtSlotCapacity}>
                                <span tabIndex={isAtSlotCapacity ? 0 : undefined} className="sm:hidden fixed bottom-6 right-20 z-20">
                                    <Button isIconOnly radius="full" size="lg" color="primary" className="shadow-lg" isDisabled={isAtSlotCapacity} onPress={() => setEditing({})}>
                                        <FontAwesomeIcon icon={faPlus}/>
                                    </Button>
                                </span>
                            </Tooltip>
                        </PermissionGate>
                    </div>
                    {releases.length === 0 ? (
                        <div className="border border-dashed border-content3 bg-content1/50 py-10 px-4 text-center">
                            <div className="text-lg font-cinzel tracking-wide text-foreground/60">No packs have yet been chronicled for this project</div>
                            <div className="text-sm text-foreground/40 mt-1">Add a release to begin assembling one from the development pool.</div>
                        </div>
                    ) : (
                        <>
                            {releases.filter((release) => release.releasedDate).map((release) => (
                                <ReleaseBlock key={release.code} {...releaseBlockProps(release)}/>
                            ))}
                            <SortableContext items={orderedUnreleased.map((release) => reorderItemId(release.code))} strategy={verticalListSortingStrategy}>
                                {orderedUnreleased.map((release) => (
                                    <SortableReleaseBlock key={release.code} {...releaseBlockProps(release)}/>
                                ))}
                            </SortableContext>
                        </>
                    )}
                </div>
            </div>
            <SizeMatchedDragOverlay
                dropAnimation={poolDropAnimation}
                activeCard={activeCard}
                isPoolOpen={isPoolOpen}
                poolChipId={containers[POOL_ID]?.[0]}
                releaseSlotId={releases[0] ? containers[releases[0].code]?.[0] : undefined}
            >
                {activeReorderRelease && (
                    <ReleaseBlockOverlay
                        release={activeReorderRelease}
                        filledCount={filledCounts.get(activeReorderRelease.code) ?? 0}
                        canEditReleases={canEditReleases}
                        canDeleteReleases={canDeleteReleases}
                    />
                )}
            </SizeMatchedDragOverlay>
            <EditReleaseModal
                isOpen={!!editing}
                project={project}
                release={editing}
                onClose={() => setEditing(undefined)}
                onSave={() => addToast({ title: "Successfully saved", color: "success", description: "Release has been saved" })}
            />
        </DndContext>
    );
};

// Sizes the dragged card to a pool chip (pool open) or a release slot (pool closed), never to whatever it's hovering (eg. a release header is much bigger)
function SizeMatchedDragOverlay({ activeCard, isPoolOpen, poolChipId, releaseSlotId, dropAnimation, children }: SizeMatchedDragOverlayProps) {
    const { droppableRects } = useDndContext();
    const targetId = isPoolOpen ? poolChipId : releaseSlotId;
    const rect = activeCard && targetId ? droppableRects.get(targetId) : undefined;

    return (
        <DragOverlay
            dropAnimation={dropAnimation}
            style={{
                transition: "width 150ms ease, height 150ms ease",
                ...(rect && { width: rect.width, height: rect.height })
            }}
        >
            {activeCard && (
                // Mirrors ReleasePositionSlot's own inset-1 capsule rather than shrinking this box directly, which would offset its center
                <div className="relative h-full">
                    <CapsuleVisual card={activeCard} className={classNames("shadow-lg", isPoolOpen ? "h-full" : "absolute inset-1")}/>
                </div>
            )}
            {children}
        </DragOverlay>
    );
}
type SizeMatchedDragOverlayProps = {
    activeCard?: IPlaytestCard;
    isPoolOpen: boolean;
    poolChipId?: string;
    releaseSlotId?: string;
    dropAnimation: DropAnimation;
    children?: ReactNode;
}

type CycleReleasesProps = { project: IProject };
