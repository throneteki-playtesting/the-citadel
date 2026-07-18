import { IProject, types } from "common/models/projects";
import { Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, NumberInput, Select, SelectItem, Textarea } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { DeepPartial } from "common/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages, ValidationSummary } from "../../components/wizard";
import { Project } from "common/models/schemas";
import { useCreateProjectMutation, useLazyGetProjectQuery, useLazyGetProjectsQuery, useUpdateProjectMutation } from "../../api";
import { EmojiSelect } from "../../components/emojiSelect";
import { useWizard } from "../../components/wizard/context";

const DefaultProjectValues: DeepPartial<IProject> = {
    active: false,
    draft: true,
    version: 0
};

export default function EditProjectModal({ isOpen, project: initial, onClose: onModalClose, onSave }: EditProjectModalProps) {
    const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();
    const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation();
    const [project, setProject] = useState<DeepPartial<IProject>>(DefaultProjectValues);

    useEffect(() => {
        setProject(initial ?? DefaultProjectValues);
    }, [initial]);

    const isNew = useMemo(() => !initial?.number, [initial?.number]);

    const onSubmit = useCallback(async (validProject: IProject) => {
        setProject(validProject);
        const newProject = isNew ? await createProject(validProject).unwrap() : await updateProject(validProject).unwrap();
        onSave?.(newProject);
        onModalClose?.(true);
    }, [createProject, isNew, onModalClose, onSave, updateProject]);

    return <Modal isOpen={isOpen} placement="center" onOpenChange={(isOpen) => !isOpen && onModalClose?.(false) } >
        <ModalContent>
            {(onClose) => (
                <Wizard
                    schema={Project.Draft}
                    onSubmit={onSubmit}
                    data={project}
                >
                    <ModalHeader>Project Editor</ModalHeader>
                    <ModalBody>
                        <ValidationSummary />
                        <WizardPages>
                            <WizardPage>
                                <ProjectNameInput name={project.name} />
                                <div className="grid grid-cols-2 gap-2 w-full">
                                    <ProjectNumberInput number={project.number} isDisabled={!isNew}/>
                                    <Select
                                        name="type"
                                        label="Type"
                                        renderValue={(types) => types.map((type) => <div className="capitalize" key={type.key}>{type.key}</div>)}
                                        defaultSelectedKeys={project.type ? [project.type] : []}
                                    >
                                        {types.map((type) => <SelectItem key={type} className="capitalize">{type}</SelectItem>)}
                                    </Select>
                                    <ProjectCodeInput code={project.code}/>
                                    <EmojiSelect label="Discord Emoji" defaultValue={project.emoji}/>
                                </div>
                                <Textarea name="description" label="Description" defaultValue={project.description}/>
                            </WizardPage>
                            <WizardPage>
                                <span className="text-xl">Additional Details</span>
                                <div className="text-sm">These details are not required, but help improve the quality and direction of a project.</div>
                                <Input name="mandateUrl" label="Mandate (URL)" defaultValue={project.mandateUrl} description="Providing a mandate helps team alignment, quality & direction"/>
                                <Input name="formUrl" label="Form (URL)" defaultValue={project.formUrl} description="Required for legacy reasons. Will be removed in a future update"/>
                                <Input name="script" label="GAS Script" defaultValue={project.script} description="Required for legacy reasons. Will be removed in a future update"/>
                            </WizardPage>
                        </WizardPages>
                    </ModalBody>
                    <ModalFooter>
                        <WizardBack onCancel={onClose}/>
                        <WizardNext isLoading={isCreating || isUpdating} color={"primary"}/>
                    </ModalFooter>
                </Wizard>
            )}
        </ModalContent>
    </Modal>;
};

type EditProjectModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    project?: DeepPartial<IProject>;
    onClose?: (isSaving: boolean) => void;
    onSave?: (project: IProject) => void;
}

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
}

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
}

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
}