import { useEffect, useState } from "react";
import { addToast, Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Tooltip } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { useNavigate } from "react-router-dom";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronRight, faEllipsisVertical, faGripVertical, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { IProject, IProjectRelease } from "common/models/projects";
import { Faction, IPlaytestCard } from "common/models/cards";
import { getPositionFaction } from "common/utils";
import { useDeleteReleaseMutation } from "../../../api";
import ConfirmModal from "../../../components/confirmModal";
import PublishReleaseModal from "./publishReleaseModal";
import CapsuleVisual from "./capsuleVisual";
import { factionBorderClasses, highlightTarget, releaseStatusColors } from "../../../constants";
import { findNextAvailableIndex, isFactionCompatible, noReorderPreview, normalizeDroppableId, reorderItemId, slotNumberFromItemId } from "./releaseDnd";
import { HighlightTarget } from "../../../components/highlightTarget";

// Reordering only applies to unreleased releases - wraps ReleaseBlock with its own drag handle/transform
export function SortableReleaseBlock(props: ReleaseBlockProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: reorderItemId(props.release.code),
        disabled: !props.canEditReleases
    });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <div ref={setNodeRef} style={style} className="relative">
            {props.isReorderDragging && (
                <div className="absolute inset-0 border-2 border-dashed border-content3"/>
            )}
            <div className={classNames({ "invisible": isDragging })}>
                <ReleaseBlock {...props} dragHandleListeners={listeners} dragHandleAttributes={attributes}/>
            </div>
        </div>
    );
}

// Cursor-riding copy of the block header during a reorder drag - mounts in its opposite state and flips via effect so it animates rather than snaps
export function ReleaseBlockOverlay({ release, filledCount, canEditReleases, canDeleteReleases }: ReleaseBlockOverlayProps) {
    const { active } = useDndContext();
    const isDragging = active !== null;
    const [visualDragging, setVisualDragging] = useState(!isDragging);
    useEffect(() => {
        setVisualDragging(isDragging);
    }, [isDragging]);

    return (
        <div className="border border-content3 bg-content1 cursor-grabbing shadow-lg">
            <ReleaseBlockHeader
                release={release}
                filledCount={filledCount}
                isCollapsed
                isReorderDragging={visualDragging}
                canEditReleases={canEditReleases}
                canDeleteReleases={canDeleteReleases}
                showDragHandle
            />
        </div>
    );
}
type ReleaseBlockOverlayProps = {
    release: IProjectRelease;
    filledCount: number;
    canEditReleases: boolean;
    canDeleteReleases: boolean;
}

function ReleaseBlockHeader({ release, filledCount, isCollapsed, isReorderDragging, canEditReleases, canDeleteReleases, publishTooltip = "Publish Release", isPublishDisabled = false, onToggleCollapse, onEdit, onPublish, onDelete, showDragHandle, dragHandleListeners, dragHandleAttributes }: ReleaseBlockHeaderProps) {
    const isLocked = !!release.releasedDate;
    const displayStatus = isLocked ? "released" : release.status;

    return (
        <div className="flex items-center gap-2 px-4 py-3 bg-content2 border-b border-content3 cursor-pointer" onClick={onToggleCollapse}>
            {showDragHandle && (
                <span
                    className={classNames("px-1 text-foreground/40 touch-manipulation select-none", canEditReleases ? "cursor-grab" : "cursor-default")}
                    onClick={(e) => e.stopPropagation()}
                    {...dragHandleListeners}
                    {...dragHandleAttributes}
                >
                    <FontAwesomeIcon icon={faGripVertical}/>
                </span>
            )}
            <span className={classNames("flex items-center shrink-0 transition-all duration-200", isReorderDragging ? "w-0 -mr-2 opacity-0" : "w-2.5 opacity-100")}>
                <FontAwesomeIcon icon={faChevronRight} className={classNames("text-foreground/50 transition-transform duration-200", { "rotate-90": !isCollapsed })}/>
            </span>
            <div className="flex-1 min-w-0 flex flex-col items-start gap-1">
                <span className="min-w-0 max-w-full truncate text-lg font-cinzel tracking-wide">{release.name}</span>
                <div className="flex items-center gap-2 flex-wrap">
                    <Chip size="sm" variant="bordered">{release.code}</Chip>
                    <Chip size="sm" variant="flat" className="capitalize" color={releaseStatusColors[displayStatus]}>{displayStatus}</Chip>
                    <span className="text-xs text-foreground/50">{filledCount}/{release.capacity}</span>
                    {canEditReleases && release.plannedDate && <span className="text-xs text-foreground/50">{release.plannedDate}</span>}
                    {release.article?.url && <a href={release.article.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-primary underline">Article</a>}
                </div>
            </div>
            {!isLocked && (canEditReleases || canDeleteReleases) && (
                <div className={classNames("flex gap-1 transition-opacity duration-200", isReorderDragging ? "opacity-0 pointer-events-none" : "opacity-100")} onClick={(e) => e.stopPropagation()}>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button isIconOnly size="sm" variant="flat" className="sm:hidden">
                                <FontAwesomeIcon icon={faEllipsisVertical}/>
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="Release actions"
                            disabledKeys={isPublishDisabled ? ["publish"] : []}
                            onAction={(key) => {
                                if (key === "edit") {
                                    onEdit?.();
                                } else if (key === "publish") {
                                    onPublish?.();
                                } else if (key === "delete") {
                                    onDelete?.();
                                }
                            }}
                        >
                            {[
                                ...(canEditReleases ? [
                                    <DropdownItem key="edit" startContent={<FontAwesomeIcon icon={faPencil}/>}>Edit</DropdownItem>,
                                    <DropdownItem key="publish" color="success" startContent={<FontAwesomeIcon icon={faCheck}/>} description={isPublishDisabled ? publishTooltip : undefined}>Publish</DropdownItem>
                                ] : []),
                                ...(canDeleteReleases ? [
                                    <DropdownItem key="delete" color="danger" startContent={<FontAwesomeIcon icon={faTrash}/>}>Delete</DropdownItem>
                                ] : [])
                            ]}
                        </DropdownMenu>
                    </Dropdown>
                    <div className="hidden sm:flex gap-1">
                        {canEditReleases && (
                            <Tooltip content="Edit Release">
                                <Button isIconOnly size="sm" variant="flat" onPress={onEdit}>
                                    <FontAwesomeIcon icon={faPencil}/>
                                </Button>
                            </Tooltip>
                        )}
                        {canEditReleases && (
                            <Tooltip content={publishTooltip}>
                                <span tabIndex={0} className="inline-block">
                                    <Button isIconOnly size="sm" variant="flat" color="success" isDisabled={isPublishDisabled} onPress={onPublish}>
                                        <FontAwesomeIcon icon={faCheck}/>
                                    </Button>
                                </span>
                            </Tooltip>
                        )}
                        {canDeleteReleases && (
                            <Tooltip content="Delete Release">
                                <Button isIconOnly size="sm" variant="flat" color="danger" onPress={onDelete}>
                                    <FontAwesomeIcon icon={faTrash}/>
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
type ReleaseBlockHeaderProps = {
    release: IProjectRelease;
    filledCount: number;
    isCollapsed: boolean;
    isReorderDragging: boolean;
    canEditReleases: boolean;
    canDeleteReleases: boolean;
    publishTooltip?: string;
    isPublishDisabled?: boolean;
    onToggleCollapse?: () => void;
    onEdit?: () => void;
    onPublish?: () => void;
    onDelete?: () => void;
    showDragHandle?: boolean;
    dragHandleListeners?: ReturnType<typeof useSortable>["listeners"];
    dragHandleAttributes?: ReturnType<typeof useSortable>["attributes"];
}

export function ReleaseBlock({ project, release, itemIds, cardsByNumber, canEditReleases, canDeleteReleases, canMoveCapsules, isCollapsed, onToggleCollapse, onEdit, publishBlockedBy, isReorderDragging, dragHandleListeners, dragHandleAttributes }: ReleaseBlockProps) {
    const { setNodeRef } = useDroppable({ id: release.code });
    const { measureDroppableContainers, droppableContainers, active, over } = useDndContext();
    const [deleteRelease, { isLoading: isDeleting }] = useDeleteReleaseMutation();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

    const isLocked = !!release.releasedDate;
    const filledCount = itemIds.filter((id) => slotNumberFromItemId(id) !== undefined).length;
    const isComplete = filledCount >= release.capacity;
    const disabled = isLocked || !canMoveCapsules;

    // Previews handleDragEnd's fallback (cycleReleases.tsx) - checks `over` directly since a specific slot always wins collision over this container
    const activeIdStr = active ? String(active.id) : undefined;
    const activeFaction = active?.data.current?.faction as Faction | undefined;
    const isOwnRelease = !!activeIdStr && itemIds.includes(activeIdStr);
    const overIdNormalized = over ? normalizeDroppableId(String(over.id)) : undefined;
    const overIndexInRelease = overIdNormalized ? itemIds.indexOf(overIdNormalized) : -1;
    const isHoveringRelease = !!overIdNormalized && (overIdNormalized === release.code || overIndexInRelease !== -1);
    const isDirectValidTarget = overIndexInRelease !== -1 && isFactionCompatible(getPositionFaction(release.slots, overIndexInRelease + 1), activeFaction);
    const nextAvailableIndex = findNextAvailableIndex(itemIds, release.slots, activeFaction);
    const showNextSlotHighlight = isHoveringRelease && !isDirectValidTarget && !isOwnRelease && nextAvailableIndex !== -1;

    const publishTooltip = !isComplete
        ? "Every position must be filled before publishing"
        : publishBlockedBy
            ? `Release "${publishBlockedBy}" must be published first - releases can only be published in sequence`
            : "Publish Release";

    const assignedCards = itemIds
        .map((id, index) => {
            const slotNumber = slotNumberFromItemId(id);
            const card = slotNumber !== undefined ? cardsByNumber.get(slotNumber) : undefined;
            return card ? { position: index + 1, card } : undefined;
        })
        .filter((entry): entry is { position: number, card: IPlaytestCard } => !!entry);

    const onDelete = async () => {
        try {
            await deleteRelease({ project: project.number, code: release.code }).unwrap();
            setIsConfirmingDelete(false);
            addToast({ title: "Successfully deleted", color: "success", description: `Release '${release.code}' has been deleted` });
        } catch {
            addToast({ title: "Failed to delete", color: "danger", description: "An unknown error has occurred" });
        }
    };

    return (
        <HighlightTarget className="overflow-visible" targetId={highlightTarget.release(project.number, release.code)}>
            <div
                ref={setNodeRef}
                className={classNames(
                    "border bg-content1 transition-[transform,colors] duration-150",
                    showNextSlotHighlight ? "border-primary bg-primary/5 scale-[1.01]" : "border-content3"
                )}
            >
                <ReleaseBlockHeader
                    release={release}
                    filledCount={filledCount}
                    isCollapsed={isCollapsed}
                    isReorderDragging={isReorderDragging}
                    canEditReleases={canEditReleases}
                    canDeleteReleases={canDeleteReleases}
                    publishTooltip={publishTooltip}
                    isPublishDisabled={!isComplete || !!publishBlockedBy}
                    onToggleCollapse={onToggleCollapse}
                    onEdit={onEdit}
                    onPublish={() => setIsPublishModalOpen(true)}
                    onDelete={() => setIsConfirmingDelete(true)}
                    showDragHandle={!!dragHandleListeners}
                    dragHandleListeners={dragHandleListeners}
                    dragHandleAttributes={dragHandleAttributes}
                />
                <AnimatePresence initial={false}>
                    {!isCollapsed && (
                        <motion.div
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            // Forces DnD kit to remeasure containers once block expands/collapses
                            onAnimationComplete={() => measureDroppableContainers(droppableContainers.getEnabled().map((container) => container.id))}
                        >
                            <SortableContext items={itemIds} strategy={noReorderPreview}>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 p-3">
                                    {itemIds.map((id, index) => {
                                        const slotNumber = slotNumberFromItemId(id);
                                        const card = slotNumber !== undefined ? cardsByNumber.get(slotNumber) : undefined;
                                        return (
                                            <ReleasePositionSlot
                                                key={id}
                                                id={id}
                                                position={index + 1}
                                                faction={getPositionFaction(release.slots, index + 1)}
                                                card={card}
                                                disabled={disabled}
                                                isNextSlotTarget={showNextSlotHighlight && index === nextAvailableIndex}
                                            />
                                        );
                                    })}
                                </div>
                            </SortableContext>
                        </motion.div>
                    )}
                </AnimatePresence>
                <ConfirmModal
                    isOpen={isConfirmingDelete}
                    isLoading={isDeleting}
                    title={`Delete release '${release.code}'?`}
                    content="Any cards assigned to this release will be returned to the development pool."
                    confirmContent="Delete"
                    onConfirm={onDelete}
                    onClose={() => setIsConfirmingDelete(false)}
                />
                <PublishReleaseModal
                    isOpen={isPublishModalOpen}
                    project={project}
                    release={release}
                    assignedCards={assignedCards}
                    onClose={() => setIsPublishModalOpen(false)}
                    onSave={() => addToast({ title: "Successfully published", color: "success", description: `Release '${release.code}' has been published` })}
                />
            </div>
        </HighlightTarget>
    );
}
export type ReleaseBlockProps = {
    project: IProject;
    release: IProjectRelease;
    itemIds: string[];
    cardsByNumber: Map<number, IPlaytestCard>;
    canEditReleases: boolean;
    canDeleteReleases: boolean;
    canMoveCapsules: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onEdit: () => void;
    publishBlockedBy: string | undefined;
    isReorderDragging: boolean;
    dragHandleListeners?: ReturnType<typeof useSortable>["listeners"];
    dragHandleAttributes?: ReturnType<typeof useSortable>["attributes"];
}

export function ReleasePositionSlot({ id, position, faction, card, disabled, isNextSlotTarget }: ReleasePositionSlotProps) {
    const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable({ id, disabled: disabled || !card, data: { faction: card?.faction } });
    const { active } = useDndContext();
    const navigate = useNavigate();
    const showBackground = !card || isDragging;
    // Slots are faction-locked; while a card is dragged, slots of other factions dim and never highlight
    const activeFaction = active?.data.current?.faction as Faction | undefined;
    const isFactionMismatch = !!faction && !!activeFaction && activeFaction !== faction;
    // Hovering an occupied slot only shrinks/darkens the occupant - the swap is confirmed on drop
    const isPendingReplacement = isOver && !isDragging && !!card && !isFactionMismatch;
    // isNextSlotTarget previews where a generic release-area hover would actually land the card
    const showHighlight = (isOver && !isFactionMismatch) || isNextSlotTarget;

    return (
        <div ref={setNodeRef} className="relative h-11">
            {showBackground && (
                <div className={classNames(
                    "absolute inset-1 flex items-center justify-center gap-1 font-cinzel text-sm rounded-md border-2 border-dashed transition-[colors,opacity,transform] pointer-events-none text-foreground/25",
                    showHighlight ? "border-primary bg-primary/10 scale-105" : faction ? factionBorderClasses[faction] : "border-content3",
                    { "opacity-30": isFactionMismatch }
                )}>
                    {position}
                </div>
            )}
            {card && !isDragging && (
                <CapsuleVisual
                    card={card}
                    listeners={listeners}
                    attributes={attributes}
                    draggable={!disabled}
                    onClick={disabled ? () => navigate(`/project/${card.project}/${card.number}`) : undefined}
                    flipSlot={card.number}
                    className={classNames("absolute inset-1 z-10 transition-[transform,filter] duration-150", { "scale-90 brightness-75": isPendingReplacement })}
                />
            )}
        </div>
    );
}
type ReleasePositionSlotProps = {
    id: string;
    position: number;
    faction?: Faction;
    card?: IPlaytestCard;
    disabled: boolean;
    isNextSlotTarget?: boolean;
}
