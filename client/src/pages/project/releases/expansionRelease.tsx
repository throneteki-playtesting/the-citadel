import { useMemo, useState } from "react";
import { addToast, Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Skeleton, Tooltip } from "@heroui/react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, MeasuringStrategy, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faEllipsisVertical, faPencil } from "@fortawesome/free-solid-svg-icons";
import { IProject, IProjectRelease } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import { getPositionFaction } from "common/utils";
import { useGetCardsQuery, useGetSlotsQuery } from "../../../api";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import EditReleaseModal from "./editReleaseModal";
import PublishReleaseModal from "./publishReleaseModal";
import CapsuleVisual from "./capsuleVisual";
import { ReleasePositionSlot } from "./releaseBlock";
import { buildContainers, collisionDetection, dropAnimation, noReorderPreview, slotNumberFromItemId } from "./releaseDnd";
import { useCapsuleFlip } from "./releaseFlip";
import { useCommitMove } from "./useCommitMove";
import { DeepPartial } from "common/types";
import { releaseStatusColors } from "../../../constants";

// An expansion ships as one fixed release containing every card - no development pool, no
// adding/deleting/reordering releases; only editing, rearranging within factions, and publishing
export default function ExpansionRelease({ project }: ExpansionReleaseProps) {
    const { data: slotsData, isLoading: isLoadingSlots } = useGetSlotsQuery({ project: project.number });
    const { data: cardsData, isLoading: isLoadingCards } = useGetCardsQuery({ filter: { project: project.number, latest: true } });

    const canEditReleases = usePermission(Permission.EDIT_RELEASES);
    const canEditSlots = usePermission(Permission.EDIT_SLOTS);
    // Moving capsules touches both the slot and the release - see server-side PATCH /slots/:slot/release
    const canMoveCapsules = canEditSlots && canEditReleases;

    const [editing, setEditing] = useState<DeepPartial<IProjectRelease>>();
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [activeId, setActiveId] = useState<string>();
    const captureFlip = useCapsuleFlip();
    const commitMove = useCommitMove(project.number, captureFlip);

    // TouchSensor (unlike PointerSensor) can preventDefault on touchmove during an active drag,
    // which lets capsules use touch-manipulation so swipes on them still scroll the page
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
    );

    const release = project.releases[0];
    const cardsByNumber = useMemo(() => new Map((cardsData?.items ?? []).map((card) => [card.number, card])), [cardsData]);
    const slots = useMemo(() => slotsData?.items ?? [], [slotsData]);
    const itemIds = useMemo(
        () => (release ? buildContainers([], [release], slots)[release.code] : []),
        [release, slots]
    );

    if (isLoadingSlots || isLoadingCards) {
        return <Skeleton className="w-full h-98 rounded-md"/>;
    }

    if (!release) {
        return (
            <div className="border border-dashed border-content3 bg-content1/50 py-10 px-4 text-center">
                <div className="text-lg font-cinzel tracking-wide text-foreground/60">This expansion has no release chronicled</div>
                <div className="text-sm text-foreground/40 mt-1">Its release is created when the project is initialised.</div>
            </div>
        );
    }

    const isLocked = !!release.releasedDate;
    const displayStatus = isLocked ? "released" : release.status;
    const filledCount = itemIds.filter((id) => slotNumberFromItemId(id) !== undefined).length;
    const isComplete = filledCount >= release.capacity;
    const disabled = isLocked || !canMoveCapsules;
    const publishTooltip = isComplete ? "Publish Release" : "Every position must be filled before publishing";

    const activeSlotNumber = activeId ? slotNumberFromItemId(activeId) : undefined;
    const activeCard = activeSlotNumber !== undefined ? cardsByNumber.get(activeSlotNumber) : undefined;

    const assignedCards = itemIds
        .map((id, index) => {
            const slotNumber = slotNumberFromItemId(id);
            const card = slotNumber !== undefined ? cardsByNumber.get(slotNumber) : undefined;
            return card ? { position: index + 1, card } : undefined;
        })
        .filter((entry): entry is { position: number, card: IPlaytestCard } => !!entry);

    const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(undefined);

        const activeIdStr = String(active.id);
        const slotNumber = slotNumberFromItemId(activeIdStr);
        if (!over || slotNumber === undefined || String(over.id) === activeIdStr) {
            return;
        }

        const overIndex = itemIds.indexOf(String(over.id));
        if (overIndex === -1) {
            return;
        }
        const position = overIndex + 1;

        // Positions are faction-locked - silently ignore drops onto another faction's slots
        const originalSlot = slots.find((s) => s.number === slotNumber);
        const positionFaction = getPositionFaction(release.slots, position);
        if (positionFaction && originalSlot && positionFaction !== originalSlot.faction) {
            return;
        }
        if (originalSlot?.release?.position === position) {
            return;
        }

        await commitMove(slotNumber, release.code, position);
    };

    return (
        <DndContext sensors={sensors} collisionDetection={collisionDetection} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(undefined)}>
            <div className="flex flex-col gap-2">
                <div className="text-sm text-foreground/50">
                    {canMoveCapsules && !isLocked
                        ? "Rearrange cards within their faction's slots to plan the release. Publishing locks its contents permanently."
                        : "Publishing a release locks its contents permanently."}
                </div>
                <div className="border border-content3 bg-content1">
                    <div className="flex items-center gap-2 px-4 py-3 bg-content2 border-b border-content3">
                        <div className="flex-1 min-w-0 flex flex-col items-start gap-1">
                            <span className="min-w-0 max-w-full truncate text-lg font-cinzel tracking-wide">{release.name}</span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Chip size="sm" variant="bordered">{release.code}</Chip>
                                <Chip size="sm" variant="flat" className="capitalize" color={releaseStatusColors[displayStatus]}>{displayStatus}</Chip>
                                <span className="text-xs text-foreground/50">{filledCount}/{release.capacity}</span>
                                {release.plannedDate && <span className="text-xs text-foreground/50">{release.plannedDate}</span>}
                                {release.article?.url && <a href={release.article.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Article</a>}
                            </div>
                        </div>
                        {!isLocked && canEditReleases && (
                            <div className="flex gap-1">
                                <Dropdown>
                                    <DropdownTrigger>
                                        <Button isIconOnly size="sm" variant="flat" className="sm:hidden">
                                            <FontAwesomeIcon icon={faEllipsisVertical}/>
                                        </Button>
                                    </DropdownTrigger>
                                    <DropdownMenu
                                        aria-label="Release actions"
                                        disabledKeys={!isComplete ? ["publish"] : []}
                                        onAction={(key) => {
                                            if (key === "edit") {
                                                setEditing(release);
                                            } else if (key === "publish") {
                                                setIsPublishModalOpen(true);
                                            }
                                        }}
                                    >
                                        <DropdownItem key="edit" startContent={<FontAwesomeIcon icon={faPencil}/>}>Edit</DropdownItem>
                                        <DropdownItem key="publish" color="success" startContent={<FontAwesomeIcon icon={faCheck}/>} description={!isComplete ? publishTooltip : undefined}>Publish</DropdownItem>
                                    </DropdownMenu>
                                </Dropdown>
                                <div className="hidden sm:flex gap-1">
                                    <Tooltip content="Edit Release">
                                        <Button isIconOnly size="sm" variant="flat" onPress={() => setEditing(release)}>
                                            <FontAwesomeIcon icon={faPencil}/>
                                        </Button>
                                    </Tooltip>
                                    <Tooltip content={publishTooltip}>
                                        <span tabIndex={0} className="inline-block">
                                            <Button isIconOnly size="sm" variant="flat" color="success" isDisabled={!isComplete} onPress={() => setIsPublishModalOpen(true)}>
                                                <FontAwesomeIcon icon={faCheck}/>
                                            </Button>
                                        </span>
                                    </Tooltip>
                                </div>
                            </div>
                        )}
                    </div>
                    <SortableContext items={itemIds} strategy={noReorderPreview}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 p-3">
                            {itemIds.map((id, index) => {
                                const slotNumber = slotNumberFromItemId(id);
                                const card = slotNumber !== undefined ? cardsByNumber.get(slotNumber) : undefined;
                                return (
                                    <ReleasePositionSlot key={id} id={id} position={index + 1} faction={getPositionFaction(release.slots, index + 1)} card={card} disabled={disabled}/>
                                );
                            })}
                        </div>
                    </SortableContext>
                </div>
            </div>
            <DragOverlay dropAnimation={dropAnimation}>
                {activeCard && <CapsuleVisual card={activeCard} className="h-full shadow-lg"/>}
            </DragOverlay>
            <EditReleaseModal
                isOpen={!!editing}
                project={project}
                release={editing}
                onClose={() => setEditing(undefined)}
                onSave={() => addToast({ title: "Successfully saved", color: "success", description: "Release has been saved" })}
            />
            <PublishReleaseModal
                isOpen={isPublishModalOpen}
                project={project}
                release={release}
                assignedCards={assignedCards}
                onClose={() => setIsPublishModalOpen(false)}
                onSave={() => addToast({ title: "Successfully published", color: "success", description: `Release '${release.code}' has been published` })}
            />
        </DndContext>
    );
};

type ExpansionReleaseProps = { project: IProject };
