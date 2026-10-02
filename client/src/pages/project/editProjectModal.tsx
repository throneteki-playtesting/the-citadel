import { IProject, types } from "common/models/projects";
import {
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
    useUpdateProjectMutation
} from "../../api";
import { EmojiSelect } from "../../components/emojiSelect";
import { useWizard } from "../../components/wizard/context";
import UserSelect from "../../components/data/userSelect";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission } from "common/utils";
import { compact } from "lodash-es";
import Permission from "common/models/permissions";

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
    const [project, setProject] = useState<DeepPartial<IProject>>(DefaultProjectValues);

    // Reset while closed, so the next opening starts from the saved project rather than an abandoned edit
    useEffect(() => {
        if (!isOpen) {
            setProject(initial ?? DefaultProjectValues);
        }
    }, [initial, isOpen]);

    const isNew = useMemo(() => !initial?.number, [initial?.number]);
    const owners = useMemo(() => compact(project.owners), [project.owners]);

    const onSubmit = useCallback(
        async (submitted: IProject) => {
            // Owners aren't a form field, so the wizard only holds the list it opened with
            const validProject = { ...submitted, owners };
            setProject(validProject);
            const newProject = isNew
                ? await createProject(validProject).unwrap()
                : await updateProject(validProject).unwrap();
            onSave?.(newProject);
            onModalClose?.(true);
        },
        [createProject, isNew, onModalClose, onSave, owners, updateProject]
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
                    <Wizard schema={Project.Draft} onSubmit={onSubmit} data={project}>
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
                                        >
                                            {types.map((type) => (
                                                <SelectItem key={type} className="capitalize">
                                                    {type}
                                                </SelectItem>
                                            ))}
                                        </Select>
                                        <EmojiSelect label="Discord Emoji" defaultValue={project.emoji} />
                                    </div>
                                    <OwnersField
                                        owners={owners}
                                        onChange={(ids) => setProject((prev) => ({ ...prev, owners: ids }))}
                                    />
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
                            </WizardPages>
                        </ModalBody>
                        <ModalFooter>
                            <WizardBack onCancel={onClose} />
                            <WizardNext isLoading={isCreating || isUpdating} color={"primary"} />
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
