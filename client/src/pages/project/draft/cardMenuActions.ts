import { faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { CardAction } from "./useCardActions";

const noop = () => undefined;
export const EDIT_ACTION: CardAction = { key: "edit", label: "Edit", icon: faPencil, onPress: noop };
const DELETE_ACTION: CardAction = {
    key: "delete",
    label: "Delete",
    icon: faTrash,
    className: "text-danger",
    onPress: noop
};

/** The stack's own menu, as it is drawn on a card in transit */
export const MENU_ACTIONS = [EDIT_ACTION, DELETE_ACTION];
