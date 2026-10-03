import { faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { IPlaytestCard } from "common/models/cards";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import { SlotAction } from "./slotFrame";

export type CardAction = SlotAction & { className?: string };

export type CardHandlers = {
    onEdit: (card: IPlaytestCard) => void;
    onDelete: (card: IPlaytestCard) => void;
};

export function useCardActions({ onEdit, onDelete }: CardHandlers) {
    const canEdit = usePermission(Permission.EDIT_CARDS);
    const canDelete = usePermission(Permission.DELETE_CARDS);
    return (card: IPlaytestCard): CardAction[] =>
        [
            canEdit && { key: "edit", label: "Edit", icon: faPencil, onPress: () => onEdit(card) },
            canDelete && {
                key: "delete",
                label: "Delete",
                icon: faTrash,
                className: "text-danger",
                onPress: () => onDelete(card)
            }
        ].flatMap((action) => (action ? [action] : []));
}
