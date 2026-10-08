import { BaseElementProps } from "../../types";
import { IPlaytestCard } from "common/models/cards";
import { useDeleteDraftMutation, useGetPoolQuery, useGetSuggestionQuery } from "../../api";
import { useCallback } from "react";
import ConfirmModal from "../../components/confirmModal";
import DraftPoolIcon from "../../components/draftPoolIcon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { suggestionIcons } from "../../constants";
import { showApiErrorToast } from "../../api/errors";

const DeleteCardModal = ({
    isOpen,
    card,
    onClose: onModalClose = () => true,
    onDelete = () => true
}: DeleteCardModalProps) => {
    const [deleteDraft, { isLoading: isDeleting }] = useDeleteDraftMutation();
    // A card made from a suggestion in the project's Draft Pool leaves it waiting there once the card is gone
    const { data: pool } = useGetPoolQuery(
        { project: card?.project ?? 0 },
        { skip: !card?.draft || !card.suggestionId }
    );
    const isPooled = !!pool?.some((entry) => entry.suggestion === card?.suggestionId);
    // Its icon is the one the suggestion carries wherever else it is listed - approved, or still awaiting
    const { data: suggestion } = useGetSuggestionQuery(card?.suggestionId ?? "", {
        skip: !isOpen || !card?.suggestionId
    });
    const suggestionIcon = suggestion
        ? suggestion._metadata?.engagement?.approvedBy
            ? suggestionIcons.approved
            : suggestionIcons.awaiting
        : suggestionIcons.base;

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

    // A card made from a suggestion is only taken out of the project - the suggestion itself stays
    const isSuggestion = !!card?.suggestionId;
    return (
        <ConfirmModal
            isOpen={isOpen}
            isLoading={isDeleting}
            title={`${isSuggestion ? "Remove" : "Delete"} "${card?.name}"?`}
            content={
                <>
                    <p>
                        {isSuggestion
                            ? "It will be removed from this project."
                            : "It will be removed & deleted from this project."}
                    </p>
                    <p className="flex items-center gap-2 text-sm text-foreground/60">
                        {!isSuggestion && (
                            <>
                                <FontAwesomeIcon icon={faTriangleExclamation} className="w-4 text-warning" />
                                This cannot be undone.
                            </>
                        )}
                        {isSuggestion && isPooled && (
                            <>
                                <DraftPoolIcon />
                                It returns to the Draft Pool.
                            </>
                        )}
                        {isSuggestion && !isPooled && (
                            <>
                                <FontAwesomeIcon icon={suggestionIcon} className="w-4" />
                                The suggestion itself is kept.
                            </>
                        )}
                    </p>
                </>
            }
            confirmContent={isSuggestion ? "Remove" : "Delete"}
            cancelContent="Back"
            onConfirm={onSubmit}
            onClose={onModalClose}
        />
    );
};

type DeleteCardModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    card?: IPlaytestCard;
    onClose?: () => void;
    onDelete?: (card: IPlaytestCard) => void;
};

export default DeleteCardModal;
