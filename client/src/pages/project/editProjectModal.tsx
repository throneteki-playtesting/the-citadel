import { IProject, types } from "common/models/projects";
import { addToast, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, NumberInput, Select, SelectItem, Textarea } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { DeepPartial } from "common/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../components/wizard";
import { Project } from "common/models/schemas";
import CardCountEditor from "./cardCountEditor";
import { useCreateProjectMutation, useUpdateProjectMutation } from "../../api";

const DefaultProjectValues: DeepPartial<IProject> = {
    active: false,
    draft: true,
    version: 0
};

const EditProjectModal = ({ isOpen, project: initial, onClose: onModalClose = () => true, onSave = () => true }: EditProjectModalProps) => {
    const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();
    const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation();
    const [project, setProject] = useState<DeepPartial<IProject>>(DefaultProjectValues);
    useEffect(() => {
        setProject(initial ?? DefaultProjectValues);
    }, [initial]);

    const isNew = useMemo(() => !initial?.number, [initial?.number]);

    const onSubmit = useCallback(async (project: IProject) => {
        setProject(project);
        try {
            const newProject = isNew ? await createProject(project).unwrap() : await updateProject(project).unwrap();
            setProject(newProject);
            onSave(newProject);
            onModalClose();
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to save", color: "danger", description: "An unknown error has occurred" });
        }
    }, [createProject, isNew, onModalClose, onSave, updateProject]);

    return <Modal isOpen={isOpen} placement="top-center" onOpenChange={(isOpen) => !isOpen && onModalClose() } hideCloseButton={isNew}>
        <ModalContent>
            {(onClose) => (
                <Wizard
                    schema={Project.Draft}
                    onSubmit={onSubmit}
                    data={project}
                >
                    <ModalHeader>Project Editor</ModalHeader>
                    <ModalBody>
                        <WizardPages>
                            <WizardPage>
                                <Input name="name" label="Name" defaultValue={project.name}/>
                                <div className="grid grid-cols-2 gap-2 w-full">
                                    <NumberInput name="number" label="Number" defaultValue={project.number} minValue={0}/>
                                    <Select
                                        name="type"
                                        label="Type"
                                        renderValue={(types) => types.map((type) => <div className="capitalize" key={type.key}>{type.key}</div>)}
                                        defaultSelectedKeys={project.type ? [project.type] : []}
                                    >
                                        {types.map((type) => <SelectItem key={type} className="capitalize">{type}</SelectItem>)}
                                    </Select>
                                    <Input name="code" label="Code" defaultValue={project.code} description="Eg. SoS"/>
                                    <Input name="emoji" label="Emoji" defaultValue={project.emoji} description="Must match a discord emoji"/>
                                </div>
                                <Textarea name="description" label="Description" defaultValue={project.description}/>
                            </WizardPage>
                            {project.draft === true &&
                                <WizardPage data={{ cardCount: project.cardCount ?? {} }}>
                                    <CardCountEditor cardCount={project.cardCount} onChange={(cardCount) => setProject((prev) => ({ ...prev, cardCount }))}/>
                                </WizardPage>
                            }
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
                        <WizardBack onCancel={!isNew ? onClose : undefined}/>
                        <WizardNext isLoading={isCreating || isUpdating} color={"primary"}/>
                    </ModalFooter>
                </Wizard>
            )}
        </ModalContent>
    </Modal>;
};

type EditProjectModalProps = Omit<BaseElementProps, "children"> & { isOpen: boolean, project?: DeepPartial<IProject>, onClose?: () => void, onSave?: (project: IProject) => void }

export default EditProjectModal;