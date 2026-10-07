import { CUSTOM_TEMPLATE, IProject, projectTemplateOf, projectTemplates, Type, types } from "common/models/projects";
import {
    addToast,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    NumberInput,
    Select,
    SelectItem
} from "@heroui/react";
import { BaseElementProps } from "../../types";
import { DeepPartial } from "common/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import RichTextArea from "../../components/richTextArea";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages, ValidationSummary } from "../../components/wizard";
import { Project } from "common/models/schemas";
import {
    useCreateProjectMutation,
    useLazyGetProjectQuery,
    useLazyGetProjectsQuery,
    useLazyGetSlotsQuery,
    useUpdateProjectMutation,
    useUpdateSlotOptionsMutation
} from "../../api";
import ProjectSlots from "./projectSlots";
import {
    changedSlotOptions,
    groupErrors,
    groupsMatchTemplate,
    slotCountsOf,
    SlotGroup,
    SlotOptionErrors
} from "./slotGroups";
import { EmojiSelect } from "../../components/emojiSelect";
import { useWizard } from "../../components/wizard/context";
import UserSelect from "../../components/data/userSelect";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission } from "common/utils";
import { chunk, compact, isEmpty } from "lodash-es";
import Permission from "common/models/permissions";

const SLOTS_PAGE = 2;
// The slots page has no form fields of its own - what it edits is held here and merged in on submit
const NO_PAGE_DATA = {};
// A group of eight factions changes eight slots at a time, so their saves go out a few together
const SLOT_SAVES_AT_ONCE = 6;

const DefaultProjectValues: DeepPartial<IProject> = {
    active: false,
    draft: true,
    version: 0
};

export default function EditProjectModal({
    isOpen,
    project: initial,
    onClose: onModalClose,
    onSave
}: EditProjectModalProps) {
    const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();
    const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation();
    const [updateSlotOptions, { isLoading: isUpdatingSlots }] = useUpdateSlotOptionsMutation();
    const [project, setProject] = useState<DeepPartial<IProject>>(DefaultProjectValues);
    const [type, setType] = useState<Type>();
    const [template, setTemplate] = useState(CUSTOM_TEMPLATE);
    const [getSlots, { isFetching: isReadingSlots }] = useLazyGetSlotsQuery();
    const [slotGroups, setSlotGroups] = useState<SlotGroup[]>();
    const [slotErrors, setSlotErrors] = useState<SlotOptionErrors>({});
    const [hasSeenSlots, setHasSeenSlots] = useState(false);

    // Reset while closed, so the next opening starts from the saved project rather than an abandoned edit
    useEffect(() => {
        if (!isOpen) {
            setProject(initial ?? DefaultProjectValues);
            setType(initial?.type);
            setTemplate(initial?.template ?? CUSTOM_TEMPLATE);
            setSlotGroups(undefined);
            setSlotErrors({});
            setHasSeenSlots(false);
        }
    }, [initial, isOpen]);

    const isNew = useMemo(() => !initial?.number, [initial?.number]);
    const templateDefinition = type && projectTemplateOf({ type, template });
    // A template with slots of its own leaves nothing to set for a project with none yet
    const hasSlotsPage = !!templateDefinition && (!templateDefinition.slots || !isNew);

    const onTypeChange = (next: Type) => {
        setType(next);
        if (!projectTemplates[next][template]) {
            setTemplate(CUSTOM_TEMPLATE);
        }
    };
    // Groups set by hand belong to the template they were set under
    const onTemplateChange = (next: string) => {
        setTemplate(next);
        setSlotGroups(undefined);
    };
    const owners = useMemo(() => compact(project.owners), [project.owners]);

    const onSubmit = useCallback(
        async (submitted: IProject) => {
            const errors = slotGroups ? groupErrors(slotGroups) : {};
            if (!isEmpty(errors)) {
                setSlotErrors(errors);
                addToast({
                    title: "Slot options need attention",
                    color: "danger",
                    description: "One or more slots have conditions that can't be saved as they are"
                });
                return;
            }

            // Owners, template and slot counts aren't form fields, so the wizard only holds what it opened with
            const setsCounts = slotGroups && submitted.draft && !templateDefinition?.slots;
            const validProject = {
                ...submitted,
                owners,
                template,
                ...(setsCounts && { slotCounts: slotCountsOf(slotGroups) })
            };
            setProject(validProject);
            const newProject = isNew
                ? await createProject(validProject).unwrap()
                : await updateProject(validProject).unwrap();

            // Options are set per slot, so they follow once the save above has opened or created the slots
            if (slotGroups) {
                const { items } = await getSlots({ project: newProject.number }).unwrap();
                const changed = changedSlotOptions(slotGroups, items);
                for (const saves of chunk(changed, SLOT_SAVES_AT_ONCE)) {
                    await Promise.all(
                        saves.map(({ number, options }) =>
                            updateSlotOptions({ project: newProject.number, number, ...options }).unwrap()
                        )
                    );
                }
            }
            onSave?.(newProject);
            onModalClose?.(true);
        },
        [
            createProject,
            getSlots,
            isNew,
            onModalClose,
            onSave,
            owners,
            slotGroups,
            template,
            templateDefinition,
            updateProject,
            updateSlotOptions
        ]
    );

    // Slots which stray from the template are no longer its own
    const templateSlots = templateDefinition?.slots;
    const onSlotGroupsChange = useCallback(
        (groups: SlotGroup[]) => {
            setSlotGroups(groups);
            setSlotErrors({});
            if (templateSlots && !groupsMatchTemplate(groups, templateSlots)) {
                setTemplate(CUSTOM_TEMPLATE);
            }
        },
        [templateSlots]
    );

    return (
        <Modal
            isOpen={isOpen}
            size="2xl"
            placement="center"
            scrollBehavior="inside"
            onOpenChange={(isOpen) => !isOpen && onModalClose?.(false)}
        >
            <ModalContent>
                {(onClose) => (
                    <Wizard
                        schema={Project.Draft}
                        onSubmit={onSubmit}
                        data={project}
                        onPageChange={(page) => page === SLOTS_PAGE && setHasSeenSlots(true)}
                    >
                        <ModalHeader>Project Editor</ModalHeader>
                        <ModalBody>
                            <ValidationSummary />
                            <WizardPages>
                                <WizardPage className="gap-3">
                                    <ProjectNameInput name={project.name} />
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                                        <ProjectNumberInput number={project.number} isDisabled={!isNew} />
                                        <ProjectCodeInput code={project.code} />
                                        <Select
                                            name="type"
                                            label="Type"
                                            renderValue={(types) =>
                                                types.map((type) => (
                                                    <div className="capitalize" key={type.key}>
                                                        {type.key}
                                                    </div>
                                                ))
                                            }
                                            defaultSelectedKeys={project.type ? [project.type] : []}
                                            onSelectionChange={(keys) => onTypeChange([...keys][0] as Type)}
                                        >
                                            {types.map((type) => (
                                                <SelectItem key={type} className="capitalize">
                                                    {type}
                                                </SelectItem>
                                            ))}
                                        </Select>
                                        <EmojiSelect label="Discord Emoji" defaultValue={project.emoji} />
                                    </div>
                                    <div className="grid w-full grid-cols-1 items-start gap-2 sm:grid-cols-2">
                                        <OwnersField
                                            owners={owners}
                                            onChange={(ids) => setProject((prev) => ({ ...prev, owners: ids }))}
                                        />
                                        <Select
                                            label="Template"
                                            description={
                                                type
                                                    ? "Determines how many slots each faction has"
                                                    : "Choose a type to see its templates"
                                            }
                                            disallowEmptySelection
                                            selectedKeys={type ? [template] : []}
                                            isDisabled={!type || !project.draft}
                                            onSelectionChange={(keys) => onTemplateChange([...keys][0] as string)}
                                        >
                                            {Object.entries(type ? projectTemplates[type] : {}).map(
                                                ([key, { name, description }]) => (
                                                    <SelectItem
                                                        key={key}
                                                        classNames={{ description: "whitespace-normal" }}
                                                        description={description}
                                                    >
                                                        {name}
                                                    </SelectItem>
                                                )
                                            )}
                                        </Select>
                                    </div>
                                    <RichTextArea
                                        name="description"
                                        label="Description"
                                        features={[]}
                                        value={project.description}
                                        onValueChange={(description) =>
                                            setProject((prev) => ({ ...prev, description }))
                                        }
                                    />
                                    <Input
                                        name="mandateUrl"
                                        label="Mandate (URL)"
                                        defaultValue={project.mandateUrl}
                                        description="Providing a mandate helps team alignment, quality & direction"
                                    />
                                </WizardPage>
                                {hasSlotsPage && (
                                    <WizardPage controlledData={NO_PAGE_DATA}>
                                        <ProjectSlots
                                            project={initial ?? DefaultProjectValues}
                                            template={templateDefinition}
                                            isNew={isNew}
                                            isActive={hasSeenSlots}
                                            groups={slotGroups}
                                            errors={slotErrors}
                                            onChange={onSlotGroupsChange}
                                        />
                                    </WizardPage>
                                )}
                            </WizardPages>
                        </ModalBody>
                        <ModalFooter>
                            <WizardBack onCancel={onClose} />
                            <WizardNext
                                submitContent={isNew ? "Create" : "Save"}
                                isLoading={isCreating || isUpdating || isReadingSlots || isUpdatingSlots}
                                color={"primary"}
                            />
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
}

type EditProjectModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    project?: DeepPartial<IProject>;
    onClose?: (isSaving: boolean) => void;
    onSave?: (project: IProject) => void;
};

function OwnersField({ owners, onChange }: OwnersFieldProps) {
    // Deliberately not project-scoped - owning a project doesn't extend to deciding who else owns it
    const { user } = useAuth();
    const canChangeOwners = hasPermission(user, Permission.EDIT_PROJECTS);
    return (
        <div className="flex flex-col gap-1">
            <UserSelect label="Owners" selectedIds={owners} isDisabled={!canChangeOwners} onChange={onChange} />
            <span className="text-xs text-foreground/50">
                {canChangeOwners
                    ? "Owners can run this project from start to finish."
                    : "Only those who can edit every project can change its owners."}
            </span>
        </div>
    );
}

type OwnersFieldProps = {
    owners: string[];
    onChange: (owners: string[]) => void;
};

function ProjectNameInput({ className, style, name: initial }: ProjectNameInputProps) {
    const [name, setName] = useState(initial);
    const { setError, clearError } = useWizard();

    const [triggerFetchProjects, { currentData: existingProjects, isFetching, reset }] = useLazyGetProjectsQuery();

    useEffect(() => {
        if (!name) {
            reset();
            return;
        }
        if (name === initial) return;
        triggerFetchProjects({ filter: { name } });
    }, [name, initial, reset, triggerFetchProjects]);

    useEffect(() => {
        if (isFetching) {
            return;
        }
        if (existingProjects && existingProjects.total > 0) {
            setError("name", "Project already exists with that name");
        } else {
            clearError("name");
        }
    }, [existingProjects, isFetching, setError, clearError]);

    return (
        <Input
            className={className}
            style={style}
            name="name"
            label="Name"
            defaultValue={initial}
            onValueChange={setName}
        />
    );
}

type ProjectNameInputProps = Omit<BaseElementProps, "children"> & {
    name?: string;
};

function ProjectNumberInput({ className, style, number: initial, isDisabled }: ProjectNumberInputProps) {
    const [number, setNumber] = useState(initial);
    const { setError, clearError } = useWizard();

    const [triggerFetchProject, { currentData: existingProject, isFetching, reset }] = useLazyGetProjectQuery();

    useEffect(() => {
        if (!number) {
            reset();
            return;
        }
        if (number === initial) return;
        triggerFetchProject({ number });
    }, [number, initial, reset, triggerFetchProject]);

    useEffect(() => {
        if (isFetching) {
            return;
        }
        if (existingProject) {
            setError("number", `Project ${existingProject.code} already exists with that number`);
        } else {
            clearError("number");
        }
    }, [existingProject, isFetching, setError, clearError]);

    return (
        <NumberInput
            className={className}
            style={style}
            name="number"
            label="Number"
            defaultValue={initial}
            minValue={0}
            maxValue={99}
            onValueChange={setNumber}
            isDisabled={isDisabled}
        />
    );
}

type ProjectNumberInputProps = Omit<BaseElementProps, "children"> & {
    number?: number;
    isDisabled: boolean;
};

function ProjectCodeInput({ className, style, code: initial }: ProjectCodeInputProps) {
    const [code, setCode] = useState(initial);
    const { setError, clearError } = useWizard();

    const [triggerFetchProjects, { currentData: existingProjects, isFetching, reset }] = useLazyGetProjectsQuery();

    useEffect(() => {
        if (!code) {
            reset();
            return;
        }
        if (code === initial) return;
        triggerFetchProjects({ filter: { code } });
    }, [code, initial, reset, triggerFetchProjects]);

    useEffect(() => {
        if (isFetching) {
            return;
        }
        if (existingProjects && existingProjects.total > 0) {
            setError("code", "Project already exists with that code");
        } else {
            clearError("code");
        }
    }, [existingProjects, isFetching, setError, clearError]);

    return (
        <Input
            className={className}
            style={style}
            name="code"
            label="Code"
            defaultValue={initial}
            onValueChange={setCode}
        />
    );
}

type ProjectCodeInputProps = Omit<BaseElementProps, "children"> & {
    code?: string;
};
