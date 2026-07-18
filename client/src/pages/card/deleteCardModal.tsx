import { BaseElementProps } from "../../types";
import { IPlaytestCard } from "common/models/cards";
import { useDeleteDraftMutation } from "../../api";
import { useCallback } from "react";
import ConfirmModal from "../../components/confirmModal";
import { showApiErrorToast } from "../../api/errors";

const DeleteCardModal = ({ isOpen, card, onClose: onModalClose = () => true, onDelete = () => true }: DeleteCardModalProps) => {
    const [deleteDraft, { isLoading: isDeleting }] = useDeleteDraftMutation();

    const onSubmit = useCallback(async () => {
        if (!card) {
            return;
        }
        try {
            await deleteDraft(card).unwrap();
            onDelete(card);
            onModalClose();
        } catch (err) {
            showApiErrorToast(err);
        }
    }, [card, deleteDraft, onDelete, onModalClose]);

    return <ConfirmModal
        isOpen={isOpen}
        isLoading={isDeleting}
        title={`Delete draft version for ${card?.name}`}
        content={"This is permanent and cannot be undone."}
        confirmContent="Delete"
        cancelContent="Back"
        onConfirm={onSubmit}
        onClose={onModalClose}
    />;
};

type DeleteCardModalProps = Omit<BaseElementProps, "children"> & { isOpen: boolean, card?: IPlaytestCard, onClose?: () => void, onDelete?: (card: IPlaytestCard) => void }

export default DeleteCardModal;