import { memo, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Chip, NumberInput, Skeleton } from "@heroui/react";
import { DndContext, DragEndEvent, UniqueIdentifier, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FormValidationContext } from "@react-stately/form";
import { skipToken } from "@reduxjs/toolkit/query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faGripVertical, faPlus, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { sum } from "lodash-es";
import { Faction } from "common/models/cards";
import { IProject, ProjectTemplate, projectTemplateOf } from "common/models/projects";
import { ISlotOptions } from "common/models/slots";
import { factionNames, pluralize } from "common/utils";
import { DeepPartial } from "common/types";
import { useGetCardsQuery, useGetSlotsQuery } from "../../api";
import Expand from "../../components/expand";
import ThronesIcon from "../../components/thronesIcon";
import SlotOptionsEditor from "../../components/slots/slotOptionsEditor";
import SlotOptionsSummary from "../../components/slots/slotOptionsSummary";
import { EXPAND_MOTION, factionBgClasses, factionBorderClasses, factionTextClasses } from "../../constants";
import { useDragSensors } from "../../hooks/useDragSensors";
import { useStableCallback } from "../../hooks/useStableCallback";
import { formatListParts } from "../../utils";
import {
    groupDropId,
    groupSortId,
    homingDrop,
    isGroupSortId,
    NEW_GROUP_DROP_ID,
    slotDragCollisions,
    useRegroupSlide
} from "./slotGroupDnd";
import {
    cardsAtRisk,
    errorKey,
    FactionScheme,
    groupSchemes,
    hasGroupErrors,
    inSlotOrder,
    isGroupDirty,
    isPositionDirty,
    moveFaction,
    newGroupIndex,
    nextGroupId,
    optionsAt,
    savedSchemes,
    SlotGroup,
    SlotOptionErrors,
    slotRanges,
    splitFaction,
    startingGroups,
    templateSchemes,
    updateGroup,
    withOptionsAt
} from "./slotGroups";

const NO_ERRORS = {};
const NO_SCHEMES: Partial<Record<Faction, FactionScheme>> = {};
const NO_ITEMS: never[] = [];
const SKELETON_GROUPS = [0, 1, 2];
// The same height as a group's row, so a group dropped into being takes the zone's place without a shift
const ROW_HEIGHT_CLASS = "h-15";
const ROW_MOTION = { ...EXPAND_MOTION, className: "overflow-hidden" };

function SlotsHeading({ canRegroup, canReorder }: { canRegroup: boolean; canReorder: boolean }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="font-semibold">Slots</div>
            <div className="text-sm text-foreground/50">
                {canRegroup
                    ? "Each slot holds one card. Factions in a group share the same slots - drag a faction to another group, or a group to change where its slots are numbered."
                    : canReorder
                      ? "Each slot holds one card. Drag a group to change where its slots are numbered."
                      : "Each slot holds one card, and these can no longer be changed."}
            </div>
        </div>
    );
}

// A project's slots, set once for every faction in a group rather than faction by faction
export default function ProjectSlots({
    project,
    template,
    isNew,
    isActive,
    groups: edited,
    errors,
    onChange
}: ProjectSlotsProps) {
    const canRegroup = !!project.draft && !template.slots;
    const canReorder = !!project.draft;

    const query = isNew || !isActive || project.number === undefined ? skipToken : { project: project.number };
    const { data: slotsData, isLoading } = useGetSlotsQuery(query);
    const { data: cardsData } = useGetCardsQuery(
        query === skipToken ? skipToken : { filter: { ...query, draft: true } }
    );
    const saved = useMemo(() => (slotsData ? savedSchemes(slotsData.items) : NO_SCHEMES), [slotsData]);
    // A template newly chosen lays its own slots over whatever the project has, as saving it will
    const isChosen = isNew || !project.type || projectTemplateOf({ ...project, type: project.type }) !== template;
    const starting = useMemo(() => {
        if (template.slots && isChosen) {
            return groupSchemes(templateSchemes(template.slots));
        }
        return slotsData ? inSlotOrder(groupSchemes(savedSchemes(slotsData.items)), slotsData.items) : startingGroups();
    }, [isChosen, slotsData, template.slots]);
    const groups = edited ?? starting;

    const sensors = useDragSensors();
    const [dragging, setDragging] = useState<Faction>();
    const [sortingId, setSortingId] = useState<number>();
    const [sortingOver, setSortingOver] = useState<UniqueIdentifier>();
    const isSorting = sortingId !== undefined;
    const sortingGroup = groups.find((group) => group.id === sortingId);
    // Alone in its group, a faction has nothing to split away from
    const canSplit =
        !!dragging && (groups.find((group) => group.factions.includes(dragging))?.factions.length ?? 0) > 1;
    const { list, regroup } = useRegroupSlide(groups, onChange);

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (isGroupSortId(active.id)) {
            setSortingId(undefined);
            setSortingOver(undefined);
            const from = groups.findIndex((group) => groupSortId(group.id) === active.id);
            const to = groups.findIndex((group) => groupSortId(group.id) === over?.id);
            if (from >= 0 && to >= 0 && from !== to) {
                onChange(arrayMove(groups, from, to));
            }
            return;
        }
        const faction = dragging;
        setDragging(undefined);
        if (!faction || !over) {
            return;
        }
        const target = groups.find((group) => groupDropId(group.id) === over.id);
        if (over.id === NEW_GROUP_DROP_ID) {
            regroup(splitFaction(groups, faction));
        } else if (target && !target.factions.includes(faction)) {
            regroup(moveFaction(groups, faction, target.id));
        }
    };

    // Keyed as the group a drop on it creates, so that group takes the zone's row over rather than opening beside it
    const zone = canSplit && (
        <motion.li key={nextGroupId(groups)} {...ROW_MOTION}>
            <NewGroupZone />
        </motion.li>
    );
    const zoneIndex = canSplit ? newGroupIndex(groups, dragging) : undefined;

    // The same array until the order changes, or dnd-kit takes the list to have changed and stops easing its rows
    const currentSortIds = groups.map((group) => groupSortId(group.id));
    const [sortIds, setSortIds] = useState(currentSortIds);
    if (sortIds.join() !== currentSortIds.join()) {
        setSortIds(currentSortIds);
    }

    // While a group is in hand, the numbers shown are those it would leave the slots with if dropped where it hovers
    const ranges = useMemo(() => {
        const from = groups.findIndex((group) => group.id === sortingId);
        const to = groups.findIndex((group) => groupSortId(group.id) === sortingOver);
        return slotRanges(from >= 0 && to >= 0 ? arrayMove(groups, from, to) : groups);
    }, [groups, sortingId, sortingOver]);
    const [expandedGroup, setExpandedGroup] = useState<number>();
    const [expandedPosition, setExpandedPosition] = useState<number>();
    const toggleGroup = useStableCallback((id: number) => {
        setExpandedGroup(expandedGroup === id ? undefined : id);
        setExpandedPosition(undefined);
    });
    const togglePosition = useStableCallback((position: number) =>
        setExpandedPosition(expandedPosition === position ? undefined : position)
    );
    const setCount = useStableCallback((id: number, count: number) => onChange(updateGroup(groups, id, { count })));
    const setOptions = useStableCallback((id: number, position: number, options: ISlotOptions) => {
        const group = groups.find((candidate) => candidate.id === id);
        if (group) {
            onChange(updateGroup(groups, id, { options: withOptionsAt(group, position, options) }));
        }
    });

    const block = (group: SlotGroup, isOverlay = false) => (
        <GroupBlock
            isOverlay={isOverlay}
            group={group}
            canRegroup={canRegroup}
            canReorder={canReorder}
            isFactionDragging={!!dragging}
            isSorting={isSorting}
            rangeFrom={ranges.get(group.id)?.from}
            rangeTo={ranges.get(group.id)?.to}
            isTarget={!!dragging && !group.factions.includes(dragging)}
            saved={saved}
            isDirty={isGroupDirty(group, saved)}
            atRisk={cardsAtRisk(group, slotsData?.items ?? NO_ITEMS, cardsData?.items ?? NO_ITEMS)}
            errors={errors}
            isExpanded={expandedGroup === group.id}
            expandedPosition={expandedGroup === group.id ? expandedPosition : undefined}
            onToggle={toggleGroup}
            onTogglePosition={togglePosition}
            onCount={setCount}
            onOptions={setOptions}
        />
    );

    if (isLoading && isActive) {
        return (
            <div className="flex w-full flex-col gap-2">
                <SlotsHeading canRegroup={canRegroup} canReorder={canReorder} />
                <div className="flex flex-col gap-1.5">
                    {SKELETON_GROUPS.map((group) => (
                        <Skeleton key={group} className={classNames(ROW_HEIGHT_CLASS, "w-full rounded-md")} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={slotDragCollisions}
            onDragStart={({ active }) => {
                if (!isGroupSortId(active.id)) {
                    setDragging(active.id as Faction);
                    return;
                }
                setSortingId(groups.find((group) => groupSortId(group.id) === active.id)?.id);
                setExpandedGroup(undefined);
                setExpandedPosition(undefined);
            }}
            onDragEnd={onDragEnd}
            onDragOver={({ over }) => sortingId !== undefined && setSortingOver(over?.id)}
            onDragCancel={() => {
                setDragging(undefined);
                setSortingId(undefined);
                setSortingOver(undefined);
            }}
        >
            <div className="flex w-full flex-col gap-2">
                <SlotsHeading canRegroup={canRegroup} canReorder={canReorder} />
                <ul ref={list} className="-mb-1.5 flex flex-col">
                    <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
                        <AnimatePresence initial={false}>
                            {groups.flatMap((group, index) => [
                                index === zoneIndex && zone,
                                <motion.li
                                    key={group.id}
                                    data-group={group.id}
                                    {...ROW_MOTION}
                                    className={isSorting ? undefined : ROW_MOTION.className}
                                >
                                    {block(group)}
                                </motion.li>
                            ])}
                            {zoneIndex === groups.length && zone}
                        </AnimatePresence>
                    </SortableContext>
                </ul>
                <div className="text-right text-sm text-foreground/50">
                    Total: {sum(groups.map((group) => group.count * group.factions.length))} slots
                </div>
            </div>
            {createPortal(
                <DragOverlay dropAnimation={homingDrop}>
                    {dragging && <FactionChip faction={dragging} isLifted />}
                    {sortingGroup && block(sortingGroup, true)}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}

// Opens where the faction in hand would sit as a group of its own, and only while it is in hand
function NewGroupZone() {
    const { setNodeRef, isOver } = useDroppable({ id: NEW_GROUP_DROP_ID });
    return (
        <div className="pb-1.5">
            <div
                ref={setNodeRef}
                className={classNames(
                    ROW_HEIGHT_CLASS,
                    "flex items-center justify-center gap-2 rounded-md border-2 border-dashed text-sm transition-colors",
                    isOver ? "border-primary bg-primary/10 text-primary" : "border-content4 text-foreground/50"
                )}
            >
                <FontAwesomeIcon icon={faPlus} />
                New group
            </div>
        </div>
    );
}

type ProjectSlotsProps = {
    /** The project as saved */
    project: DeepPartial<IProject>;
    /** A template with slots of its own fixes how many there are; without, they are set here */
    template: ProjectTemplate;
    isNew: boolean;
    /** Shown at least once - its slots are not fetched for an editor opened only to rename a project */
    isActive: boolean;
    /** The groups as edited - absent until something here is changed */
    groups?: SlotGroup[];
    errors: SlotOptionErrors;
    onChange: (groups: SlotGroup[]) => void;
};

const GroupBlock = memo(function GroupBlock({
    group,
    canRegroup,
    canReorder,
    isSorting,
    isFactionDragging,
    isOverlay,
    rangeFrom,
    rangeTo,
    isTarget,
    saved,
    isDirty,
    atRisk,
    errors,
    isExpanded,
    expandedPosition,
    onToggle,
    onTogglePosition,
    onCount,
    onOptions
}: GroupBlockProps) {
    const idOf = (id: string) => (isOverlay ? `overlay-${id}` : id);
    const { setNodeRef, isOver } = useDroppable({ id: idOf(groupDropId(group.id)), disabled: !isTarget || isOverlay });
    const {
        attributes,
        listeners,
        setNodeRef: setSortRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: idOf(groupSortId(group.id)),
        disabled: !canReorder || isOverlay || isFactionDragging
    });
    const single = group.factions.length === 1 ? group.factions[0] : undefined;
    const names = formatListParts(group.factions.map((faction) => factionNames[faction]))
        .map((part) => part.value)
        .join("");
    const hasErrors = hasGroupErrors(errors, group);
    return (
        <div className="relative pb-1.5">
            <div
                className={classNames(
                    "absolute inset-x-0 bottom-1.5 top-0 rounded-md border-2 border-dashed border-foreground/20 transition-opacity duration-200",
                    isSorting && !isOverlay ? "opacity-100" : "opacity-0"
                )}
            />
            <div
                ref={setSortRef}
                className={classNames("relative", isDragging && !isOverlay && "opacity-0")}
                style={{ transform: CSS.Translate.toString(transform), transition }}
            >
                <div
                    ref={setNodeRef}
                    className={classNames(
                        "flex flex-col rounded-md border-2 transition-colors",
                        single ? factionBgClasses[single] : "bg-content2/40",
                        isOver ? "border-primary" : single ? factionBorderClasses[single] : "border-content3"
                    )}
                >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 pl-1.5 pr-2">
                        {canReorder && (
                            <button
                                type="button"
                                aria-label={`Move the ${names} slots`}
                                className={classNames(
                                    "shrink-0 cursor-grab touch-none px-1 text-foreground/40 transition-opacity hover:text-foreground/70 active:cursor-grabbing",
                                    isFactionDragging && "pointer-events-none opacity-0"
                                )}
                                {...attributes}
                                {...listeners}
                            >
                                <FontAwesomeIcon icon={faGripVertical} />
                            </button>
                        )}
                        <div className="flex min-w-0 grow flex-wrap gap-0.5">
                            {group.factions.map((faction) =>
                                isOverlay ? (
                                    <FactionChip key={faction} faction={faction} />
                                ) : (
                                    <DraggableFaction key={faction} faction={faction} isDisabled={!canRegroup} />
                                )
                            )}
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                            {hasErrors && (
                                <Chip size="sm" variant="flat" color="danger">
                                    Needs attention
                                </Chip>
                            )}
                            {isDirty && !hasErrors && <UnsavedDot />}
                            {rangeFrom !== undefined && (
                                <span className="hidden text-xs text-foreground/50 sm:inline">
                                    {rangeFrom === rangeTo ? `#${rangeFrom}` : `#${rangeFrom}-${rangeTo}`}
                                </span>
                            )}
                            <NumberInput
                                aria-label={`Slots for ${names}`}
                                size="sm"
                                className="w-24"
                                minValue={0}
                                value={group.count}
                                isDisabled={!canRegroup}
                                onValueChange={(value) => onCount(group.id, Number.isNaN(value) ? 0 : value)}
                            />
                            <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                aria-label={`${isExpanded ? "Hide" : "Show"} slots for ${names}`}
                                isDisabled={group.count === 0}
                                onPress={() => onToggle(group.id)}
                            >
                                <Chevron isOpen={isExpanded} />
                            </Button>
                        </div>
                    </div>
                    <Expand isOpen={atRisk > 0} className="px-2 pb-1.5">
                        <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-2 py-1 text-xs text-danger">
                            <FontAwesomeIcon icon={faTriangleExclamation} />
                            Saving removes {atRisk} {pluralize(atRisk, "card")}, along with the slots they sit in.
                        </div>
                    </Expand>
                    <Expand
                        isOpen={isExpanded && group.count > 0}
                        isInstant={isSorting}
                        className="flex flex-col gap-1 p-2 pt-0.5"
                    >
                        <ul className="flex flex-col gap-1">
                            {Array.from({ length: group.count }, (_, position) => (
                                <SlotRow
                                    key={position}
                                    label={`Slot ${position + 1}`}
                                    options={optionsAt(group, position)}
                                    faction={group.factions.includes("neutral") ? "neutral" : group.factions[0]}
                                    isShared={!single}
                                    errors={errors[errorKey(group, position)]}
                                    isDirty={isPositionDirty(group, saved, position)}
                                    isExpanded={expandedPosition === position}
                                    onToggle={() => onTogglePosition(position)}
                                    onEdit={(options) => onOptions(group.id, position, options)}
                                />
                            ))}
                        </ul>
                    </Expand>
                </div>
            </div>
        </div>
    );
});

type GroupBlockProps = {
    group: SlotGroup;
    /** Factions can be moved and counts changed - not once the project has left draft, or under a fixed template */
    canRegroup: boolean;
    /** The group can be moved among the others - what sets the slots' numbers - while the project is in draft */
    canReorder: boolean;
    /** A group is in hand, so every group marks the place it could go */
    isSorting: boolean;
    /** A faction is in hand - the handle fades, keeping its place, and the group can't be picked up */
    isFactionDragging: boolean;
    /** It is the copy which follows the pointer, so it takes no part in sorting or dropping */
    isOverlay: boolean;
    /** The slot numbers the group's slots will take, as the groups stand */
    rangeFrom?: number;
    rangeTo?: number;
    /** A faction from another group is in hand, and could be dropped here */
    isTarget: boolean;
    /** The schemes as saved, to tell what has been changed from */
    saved: Partial<Record<Faction, FactionScheme>>;
    isDirty: boolean;
    /** How many cards sit in slots this group's count would close */
    atRisk: number;
    errors: SlotOptionErrors;
    isExpanded: boolean;
    expandedPosition?: number;
    onToggle: (id: number) => void;
    onTogglePosition: (position: number) => void;
    onCount: (id: number, count: number) => void;
    onOptions: (id: number, position: number, options: ISlotOptions) => void;
};

function DraggableFaction({ faction, isDisabled }: { faction: Faction; isDisabled: boolean }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: faction, disabled: isDisabled });
    return (
        <div
            ref={setNodeRef}
            {...(!isDisabled && { ...listeners, ...attributes })}
            aria-label={factionNames[faction]}
            data-faction={faction}
            className={classNames("touch-manipulation select-none", {
                "cursor-grab active:cursor-grabbing": !isDisabled,
                "opacity-30": isDragging
            })}
        >
            <FactionChip faction={faction} />
        </div>
    );
}

function FactionChip({ faction, isLifted }: { faction: Faction; isLifted?: boolean }) {
    return (
        <span
            className={classNames(
                "grid size-7 place-items-center rounded-md bg-content3",
                factionTextClasses[faction],
                { "cursor-grabbing shadow-medium": isLifted }
            )}
        >
            <ThronesIcon name={faction} />
        </span>
    );
}

// One slot open at a time: its fields are named by schema path, which two open editors would share
function SlotRow({ label, options, faction, isShared, errors, isDirty, isExpanded, onToggle, onEdit }: SlotRowProps) {
    return (
        <li className="rounded-medium border border-content3 bg-content1">
            <div className="flex items-center gap-2 py-1 pl-2 pr-1 text-xs text-foreground/60">
                <span className="shrink-0 font-semibold text-foreground">{label}</span>
                <SlotOptionsSummary options={options} />
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    {errors && (
                        <Chip size="sm" variant="flat" color="danger">
                            Needs attention
                        </Chip>
                    )}
                    {isDirty && !errors && <UnsavedDot />}
                    <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={`${isExpanded ? "Hide" : "Edit"} ${label.toLowerCase()} options`}
                        onPress={onToggle}
                    >
                        <Chevron isOpen={isExpanded} />
                    </Button>
                </div>
            </div>
            <Expand isOpen={isExpanded} className="border-t border-content3 p-2">
                <FormValidationContext.Provider value={errors ?? NO_ERRORS}>
                    <SlotOptionsEditor value={options} faction={faction} isShared={isShared} onChange={onEdit} />
                </FormValidationContext.Provider>
            </Expand>
        </li>
    );
}

type SlotRowProps = {
    label: string;
    options: ISlotOptions;
    /** The strictest faction the slot answers to - a group holding Neutral can't ask for loyalty */
    faction: Faction;
    isShared: boolean;
    errors?: Record<string, string>;
    isDirty: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onEdit: (options: ISlotOptions) => void;
};

function UnsavedDot() {
    return <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-label="Unsaved changes" role="img" />;
}

function Chevron({ isOpen }: { isOpen: boolean }) {
    return (
        <FontAwesomeIcon
            icon={faChevronDown}
            className={classNames("transition-transform duration-200", { "rotate-180": isOpen })}
        />
    );
}
