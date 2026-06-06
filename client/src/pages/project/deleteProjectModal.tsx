import { addToast } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { useDeleteProjectMutation } from "../../api";
import { useCallback } from "react";
import { IProject } from "common/models/projects";
import ConfirmModal from "../../components/confirmModal";

export default function DeleteProjectModal({ isOpen, project, onClose: onModalClose = () => true, onDelete = () => true }: DeleteProjectModalProps) {
    const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation();

    const onSubmit = useCallback(async () => {
        try {
            await deleteProject(project).unwrap();
            onDelete(project);
            onModalClose();
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to delete", color: "danger", description: "An unknown error has occurred" });
        }
    }, [deleteProject, onDelete, onModalClose, project]);


    return <ConfirmModal
        isOpen={isOpen}
        isLoading={isDeleting}
        title={`Burn ${project.name} from the archives?`}
        content="This scroll cannot be restored once cast into the flames. This action is permanent and cannot be undone."
        confirmContent="Consign to the Flames"
        cancelContent="Turn Back"
        onConfirm={onSubmit}
        onClose={onModalClose}
    />;
};

type DeleteProjectModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    project: IProject;
    onClose?: () => void;
    onDelete?: (project: IProject) => void;
}