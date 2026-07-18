import { addToast, Button, DatePicker, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, NumberInput, Select, SelectItem } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useEffect, useState } from "react";
import classNames from "classnames";
import { DndContext, DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import { IProject, IProjectRelease, ReleaseSlotAllocation } from "common/models/projects";
import { factions } from "common/models/cards";
import { ReleaseDate } from "common/models/shared";
import { DeepPartial } from "common/types";
import { factionNames, inferReleaseTemplate, releaseTemplates, ReleaseTemplate, getReleaseCapacity } from "common/utils";
import { BaseElementProps } from "../../../types";
import { useCreateReleaseMutation, useUpdateReleaseMutation } from "../../../api";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../../components/wizard";
import ThronesIcon from "../../../components/thronesIcon";
import { factionBgClasses, factionBorderClasses } from "../../../constants";
import { Release } from "common/models/schemas";

const releaseStatuses: { status: IProjectRelease["status"], description: string }[] = [
    { status: "planning", description: "Cards are still being chosen for this release" },
    { status: "confirming", description: "Final card text & details are being polished" },
    { status: "approved", description: "Contents are locked in and ready for release" }
];

// Every faction is always present in the editor (missing ones at 0), preserving any stored ordering
function normalizeSlots(slots?: DeepPartial<ReleaseSlotAllocation[]>): ReleaseSlotAllocation[] {
    const existing = (slots ?? releaseTemplates.chapterPack.slots!).filter((allocation): allocation is ReleaseSlotAllocation => !!allocation?.faction);
    const missing = factions.filter((faction) => !existing.some((allocation) => allocation.faction === faction));
    return [...existing, ...missing.map((faction) => ({ faction, count: 0 }))];
}

export default function EditReleaseModal({ isOpen, project, release: initial, onClose: onModalClose, onSave }: EditReleaseModalProps) {
    const [createRelease, { isLoading: isCreating }] = useCreateReleaseMutation();
    const [updateRelease, { isLoading: isUpdating }] = useUpdateReleaseMutation();
    const [release, setRelease] = useState<DeepPartial<IProjectRelease>>({});
    const [template, setTemplate] = useState<ReleaseTemplate>("chapterPack");

    // An expansion's release has fixed server-maintained slot counts - only the faction order is
    // editable, so zero-count factions are never padded in
    const isExpansion = project.type === "expansion";

    useEffect(() => {
        const slots = isExpansion
            ? (initial?.slots ?? []).filter((allocation): allocation is ReleaseSlotAllocation => !!allocation?.faction && (allocation.count ?? 0) > 0)
            : normalizeSlots(initial?.slots);
        setRelease({
            code: initial?.code,
            name: initial?.name,
            slots,
            status: initial?.status ?? "planning",
            plannedDate: initial?.plannedDate,
            article: initial?.article
        });
        setTemplate(inferReleaseTemplate(slots));
    }, [initial, project, isExpansion]);

    const isNew = !initial?.code;

    const onSelectTemplate = (key: ReleaseTemplate) => {
        setTemplate(key);
        const preset = releaseTemplates[key].slots;
        if (preset) {
            setRelease((prev) => ({ ...prev, slots: normalizeSlots(preset) }));
        }
    };

    const onSubmit = async (release: IProjectRelease) => {
        try {
            const body = {
                project: project.number,
                ...release
            };
            const result = isNew
                ? await createRelease(body).unwrap()
                : await updateRelease({ ...body, originalCode: initial!.code! }).unwrap();
            onSave?.(result);
            onModalClose?.(true);
        } catch {
            addToast({ title: "Failed to save", color: "danger", description: "An unknown error has occurred" });
        }
    };

    return (
        <Modal isOpen={isOpen} placement="center" onOpenChange={(isOpen) => !isOpen && onModalClose?.(false)}>
            <ModalContent>
                {(onClose) => (
                    <Wizard
                        schema={Release.Draft}
                        onSubmit={onSubmit}
                        data={release}
                    >
                        <ModalHeader>{isNew ? "New Release" : "Edit Release"}</ModalHeader>
                        <ModalBody>
                            <WizardPages>
                                <WizardPage controlledData={release}>
                                    <Input
                                        name="name"
                                        label="Name"
                                        value={release.name ?? ""}
                                        onValueChange={(name) => setRelease((prev) => ({ ...prev, name }))}
                                    />
                                    <div className={classNames("gap-2 w-full", isExpansion ? "flex" : "grid grid-cols-2")}>
                                        <Input
                                            name="code"
                                            label="Code"
                                            description="Short pack code, eg. WoW"
                                            value={release.code ?? ""}
                                            isDisabled={!isNew && !isExpansion}
                                            onValueChange={(code) => setRelease((prev) => ({ ...prev, code }))}
                                        />
                                        {!isExpansion && (
                                            <Select
                                                label="Template"
                                                description="Determines each faction's slots in this pack"
                                                disallowEmptySelection
                                                selectedKeys={[template]}
                                                onSelectionChange={(keys) => onSelectTemplate([...keys][0] as ReleaseTemplate)}
                                            >
                                                {Object.entries(releaseTemplates).map(([key, { name, description }]) => (
                                                    <SelectItem key={key} classNames={{ description: "whitespace-normal" }} description={description}>{name}</SelectItem>
                                                ))}
                                            </Select>
                                        )}
                                    </div>
                                    <Select
                                        name="status"
                                        label="Status"
                                        selectedKeys={release.status ? [release.status] : []}
                                        renderValue={(items) => items.map(({ key }) => <div className="capitalize" key={key}>{key}</div>)}
                                        onSelectionChange={(keys) => setRelease((prev) => ({ ...prev, status: [...keys][0] as IProjectRelease["status"] }))}
                                    >
                                        {releaseStatuses.map(({ status, description }) => (
                                            <SelectItem key={status} classNames={{ title: "capitalize" }} description={description}>{status}</SelectItem>
                                        ))}
                                    </Select>
                                    <DatePicker
                                        name="plannedDate"
                                        label="Planned Release Date"
                                        value={release.plannedDate ? parseDate(release.plannedDate) : null}
                                        onChange={(date) => setRelease((prev) => ({ ...prev, plannedDate: date ? date.toString() as ReleaseDate : undefined }))}
                                        endContent={release.plannedDate && (
                                            <Button
                                                isIconOnly
                                                size="sm"
                                                variant="light"
                                                aria-label="Clear planned release date"
                                                onPress={() => setRelease((prev) => ({ ...prev, plannedDate: undefined }))}
                                            >
                                                <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400"/>
                                            </Button>
                                        )}
                                    />
                                </WizardPage>
                                {(isExpansion || template === "custom") && (
                                    <WizardPage controlledData={{ slots: release.slots }}>
                                        <FactionSlotsEditor
                                            slots={isExpansion ? (release.slots ?? []) as ReleaseSlotAllocation[] : normalizeSlots(release.slots)}
                                            lockCounts={isExpansion}
                                            onChange={(slots) => setRelease((prev) => ({ ...prev, slots }))}
                                        />
                                    </WizardPage>
                                )}
                            </WizardPages>
                        </ModalBody>
                        <ModalFooter className="w-full">
                            <WizardBack onCancel={onClose}/>
                            <WizardNext color="primary" isLoading={isCreating || isUpdating} submitContent="Save"/>
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
};

type EditReleaseModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    project: IProject;
    release?: DeepPartial<IProjectRelease>;
    onClose?: (isSaving: boolean) => void;
    onSave?: (result: unknown) => void;
}

// Orderable per-faction slot allocations - drag to set the faction order within the pack, with
// positions assigned top-to-bottom
function FactionSlotsEditor({ slots, lockCounts = false, onChange }: FactionSlotsEditorProps) {
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
    );

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) {
            return;
        }
        const oldIndex = slots.findIndex((allocation) => allocation.faction === active.id);
        const newIndex = slots.findIndex((allocation) => allocation.faction === over.id);
        if (oldIndex === -1 || newIndex === -1) {
            return;
        }
        onChange(arrayMove(slots, oldIndex, newIndex));
    };

    const onCountChange = (faction: ReleaseSlotAllocation["faction"], count: number) => {
        onChange(slots.map((allocation) => allocation.faction === faction ? { ...allocation, count: isNaN(count) ? 0 : count } : allocation));
    };

    return (
        <div className="w-full flex flex-col gap-2">
            <div className="text-sm text-foreground/50">
                {lockCounts
                    ? "Drag to order each faction within the release - slot counts are fixed by the project's cards. Reordering moves every card to its newly calculated position."
                    : "Set how many slots each faction gets, and drag to order them within the pack."}
            </div>
            <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
                <SortableContext items={slots.map((allocation) => allocation.faction)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-1">
                        {slots.map((allocation) => (
                            <FactionSlotRow
                                key={allocation.faction}
                                allocation={allocation}
                                lockCount={lockCounts}
                                onCountChange={(count) => onCountChange(allocation.faction, count)}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
            <div className="text-sm text-foreground/50 text-right">Total: {getReleaseCapacity(slots)} cards</div>
        </div>
    );
}
type FactionSlotsEditorProps = {
    slots: ReleaseSlotAllocation[];
    lockCounts?: boolean;
    onChange: (slots: ReleaseSlotAllocation[]) => void;
}

function FactionSlotRow({ allocation, lockCount, onCountChange }: FactionSlotRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: allocation.faction });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={classNames(
                "flex items-center gap-2 pl-1 pr-2 py-1 rounded-md border-2",
                factionBorderClasses[allocation.faction],
                factionBgClasses[allocation.faction],
                { "z-10 shadow-lg": isDragging }
            )}
        >
            <span className="px-1 text-foreground/40 cursor-grab touch-manipulation select-none" {...listeners} {...attributes}>
                <FontAwesomeIcon icon={faGripVertical}/>
            </span>
            <ThronesIcon name={allocation.faction} className="shrink-0 text-lg opacity-60"/>
            <span className="flex-1 min-w-0 truncate font-cinzel tracking-wide">{factionNames[allocation.faction]}</span>
            <NumberInput
                aria-label={`${factionNames[allocation.faction]} slots`}
                size="sm"
                className="w-24 shrink-0"
                minValue={0}
                value={allocation.count}
                isDisabled={lockCount}
                onValueChange={onCountChange}
            />
        </div>
    );
}
type FactionSlotRowProps = {
    allocation: ReleaseSlotAllocation;
    lockCount?: boolean;
    onCountChange: (count: number) => void;
}
