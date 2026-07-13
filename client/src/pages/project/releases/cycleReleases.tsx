import { useEffect, useMemo, useRef, useState } from "react";
import { addToast, Button, Skeleton } from "@heroui/react";
import { DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, MeasuringStrategy, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { IProject, IProjectRelease } from "common/models/projects";
import { useGetCardsQuery, useGetSlotsQuery, useReorderReleasesMutation } from "../../../api";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import EditReleaseModal from "./editReleaseModal";
import PermissionGate from "../../../components/permissionGate";
import CapsuleVisual from "./capsuleVisual";
import DevelopmentPool from "./developmentPool";
import { ReleaseBlock, ReleaseBlockOverlay, ReleaseBlockProps, SortableReleaseBlock } from "./releaseBlock";
import { buildContainers, codeFromReorderItemId, collisionDetection, dropAnimation, findContainer, HOVER_EXPAND_DELAY, POOL_ID, reorderItemId, slotNumberFromItemId, withHover } from "./releaseDnd";
import { useCapsuleFlip } from "./releaseFlip";
import { useCommitMove } from "./useCommitMove";
import { DeepPartial } from "common/types";
import { getPositionFaction } from "common/utils";
import SectionTitle from "../../../components/sectionTitle";

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
    const [isPoolCollapsed, setIsPoolCollapsed] = useState(false);
    const [collapsedReleases, setCollapsedReleases] = useState<Set<string>>(new Set());
    const hasInitializedCollapse = useRef(false);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const lastHoverContainerRef = useRef<string>(undefined);
    const captureFlip = useCapsuleFlip();

    // TouchSensor (unlike PointerSensor) can preventDefault on touchmove during an active drag,
    // which lets capsules use touch-manipulation so swipes on them still scroll the page
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

    // Collapse complete/released zones by default, once (further toggles are left to the user)
    useEffect(() => {
        if (hasInitializedCollapse.current || isLoadingSlots || isLoadingCards) {
            return;
        }
        hasInitializedCollapse.current = true;
        const defaults = new Set<string>();
        for (const release of releases) {
            const filled = filledCounts.get(release.code) ?? 0;
            if (release.releasedDate || filled >= release.capacity) {
                defaults.add(release.code);
            }
        }
        setCollapsedReleases(defaults);
    }, [isLoadingSlots, isLoadingCards, releases, filledCounts]);

    const baseContainers = useMemo(() => buildContainers(pool, releases, slots), [pool, releases, slots]);
    const containers = useMemo(
        () => (activeId && overId ? withHover(baseContainers, activeId, overId) : baseContainers),
        [baseContainers, activeId, overId]
    );

    const activeSlotNumber = activeId ? slotNumberFromItemId(activeId) : undefined;
    const activeCard = activeSlotNumber !== undefined ? cardsByNumber.get(activeSlotNumber) : undefined;
    const activeReorderCode = activeId ? codeFromReorderItemId(activeId) : undefined;
    const activeReorderRelease = activeReorderCode ? releases.find((release) => release.code === activeReorderCode) : undefined;
    const isReorderDragging = !!activeReorderCode;

    // The pool's own droppable only fires isOver for its exact container id, but pool cards are
    // individually droppable too - hovering any one of them should still highlight the whole zone
    const hoveredContainer = overId ? findContainer(containers, overId) : undefined;

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
        // Reordering collapses every release for the duration - and leaves them collapsed after
        if (codeFromReorderItemId(id) !== undefined) {
            setCollapsedReleases(new Set(releases.map((release) => release.code)));
        }
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (codeFromReorderItemId(String(active.id)) !== undefined) {
            return;
        }

        // Once withHover moves the active card, the next measurement can report over === active
        // without the pointer moving - reverting here would undo the preview and loop forever
        if (over && String(over.id) === String(active.id)) {
            return;
        }

        const overContainer = over ? findContainer(containers, String(over.id)) : undefined;
        setOverId(over ? String(over.id) : undefined);

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

        // The withHover preview may already hold the final arrangement, and once it has moved the
        // active card's DOM node, over.id can equal the active id - trust the live state over `over`
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
            const overIdStr = String(over.id);
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
                let overIndex = baseContainers[overContainer].indexOf(overIdStr);
                if (overIndex === -1) {
                    overIndex = baseContainers[overContainer].findIndex((id) => slotNumberFromItemId(id) === undefined);
                    if (overIndex === -1) {
                        return;
                    }
                }
                position = overIndex + 1;
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
        <DndContext sensors={sensors} collisionDetection={collisionDetection} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={resetDragState}>
            <div className="flex flex-col gap-2">
                <div className="text-sm text-foreground/50">
                    {canMoveCapsules
                        ? "Drag cards between the development pool and release packs to plan each release. Publishing a pack locks its contents permanently."
                        : "Publishing a pack locks its contents permanently."}
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                    {canMoveCapsules && (
                        <div className="md:w-2/5 md:shrink-0">
                            <DevelopmentPool
                                itemIds={containers[POOL_ID] ?? []}
                                cardsByNumber={cardsByNumber}
                                isCollapsed={isPoolCollapsed}
                                onToggle={() => setIsPoolCollapsed((prev) => !prev)}
                                isHovered={hoveredContainer === POOL_ID}
                            />
                        </div>
                    )}
                    <div className="flex-1 min-w-0 flex flex-col gap-2 md:sticky md:top-20">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <SectionTitle size="lg" className="flex-1">Releases</SectionTitle>
                            <PermissionGate requires={Permission.CREATE_RELEASES}>
                                <Button size="sm" variant="flat" className="w-full sm:w-auto" startContent={<FontAwesomeIcon icon={faPlus}/>} onPress={() => setEditing({})}>
                                    Add Release
                                </Button>
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
            </div>
            <DragOverlay dropAnimation={dropAnimation}>
                {activeCard && <CapsuleVisual card={activeCard} className="h-full shadow-lg"/>}
                {activeReorderRelease && (
                    <ReleaseBlockOverlay
                        release={activeReorderRelease}
                        filledCount={filledCounts.get(activeReorderRelease.code) ?? 0}
                        canEditReleases={canEditReleases}
                        canDeleteReleases={canDeleteReleases}
                    />
                )}
            </DragOverlay>
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

type CycleReleasesProps = { project: IProject };
