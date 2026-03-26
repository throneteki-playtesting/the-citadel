import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import PermissionGate from "../../../components/permissionGate";
import { Button } from "@heroui/react";
import { CardPreview } from "@agot/card-preview";
import { renderPlaytestingCard } from "common/utils";
import { IPlaytestCard } from "common/models/cards";
import Permission from "common/models/permissions";
import { faPencil, faX } from "@fortawesome/free-solid-svg-icons";
import { memo } from "react";

const PreviewCardSlot = memo(({ card, onEdit = () => true, onDelete = () => true }: PreviewCardSlotProps) => {
    return (
        <div key={card.code} className="relative">
            <div className="absolute right-0 w-full h-full z-1 opacity-25 p-1 flex justify-end hover:opacity-90 transition-opacity gap-0.5">
                <PermissionGate requires={Permission.EDIT_CARDS}>
                    <Button isIconOnly radius="full" variant="faded" size="sm" onPress={onEdit}>
                        <FontAwesomeIcon icon={faPencil}/>
                    </Button>
                </PermissionGate>
                <PermissionGate requires={Permission.DELETE_CARDS}>
                    <Button isIconOnly radius="full" variant="faded" size="sm" onPress={onDelete}>
                        <FontAwesomeIcon icon={faX}/>
                    </Button>
                </PermissionGate>
            </div>
            <CardPreview
                key={card.code}
                card={renderPlaytestingCard(card)}
                orientation="vertical"
                rounded
                className="transition-all"
            />
        </div>
    );
});

type PreviewCardSlotProps = { card: IPlaytestCard, onEdit?: () => void, onDelete?: () => void }

export default PreviewCardSlot;