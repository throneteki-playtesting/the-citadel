import { BaseElementProps } from "../../types";
import { useArchiveProjectMutation, useDeleteProjectMutation } from "../../api";
import { useCallback } from "react";
import { IProject } from "common/models/projects";
import ConfirmModal from "../../components/confirmModal";
import { showApiErrorToast } from "../../api/errors";

export default function DeleteProjectModal({ isOpen, project, onClose: onModalClose = () => true, onDelete = () => true }: DeleteProjectModalProps) {
    const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation();
    const [archiveProject, { isLoading: isArchiving }] = useArchiveProjectMutation();

    const isDraft = project.draft && !project.active;

    const onSubmit = useCallback(async () => {
        try {
            if (isDraft) {
                await deleteProject(project).unwrap();
            } else {
                await archiveProject(project).unwrap();
            }
            onDelete(project);
            onModalClose();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Delete" });
        }
    }, [archiveProject, deleteProject, isDraft, onDelete, onModalClose, project]);

    if (isDraft) {
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
    }
    return <ConfirmModal
        isOpen={isOpen}
        isLoading={isArchiving}
        title={`Send ${project.name} to the archives?`}
        content="This scroll will be safely archived, and may only be restored by a user with sufficient permissions. Once archived, users will not be able to access this project or its cards."
        confirmContent="Lock it away"
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