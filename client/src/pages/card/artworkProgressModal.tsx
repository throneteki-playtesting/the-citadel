import { useEffect, useState } from "react";
import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    Skeleton
} from "@heroui/react";
import { ArtworkStatus, ArtworkType, artworkTypes } from "common/models/slots";
import Permission from "common/models/permissions";
import { useGetSlotQuery, useUpdateSlotMutation } from "../../api";
import { usePermission } from "../../hooks/usePermission";
import { showApiErrorToast } from "../../api/errors";
import { artworkLane, artworkTypeDescriptions, artworkTypeNames, laneSteps } from "../../constants";
import StatusStepper, { StatusStepDetail } from "../../components/statusStepper";
import ProductionLockAlert from "./productionLockAlert";

const steps = laneSteps(artworkLane);

export default function ArtworkProgressModal({ isOpen, onClose, project, number }: ArtworkProgressModalProps) {
    const { data: slot, isLoading } = useGetSlotQuery({ project, number });
    const [updateSlot, { isLoading: isSaving }] = useUpdateSlotMutation();
    const canEdit = usePermission(Permission.EDIT_SLOTS);

    const artwork = slot?.statuses.artwork;
    const [status, setStatus] = useState<ArtworkStatus>("pending");
    const [type, setType] = useState<ArtworkType | undefined>(undefined);

    useEffect(() => {
        if (artwork) {
            setStatus(artwork.status);
            setType(artwork.type);
        }
    }, [artwork]);

    // Artwork is frozen once a card file exists downstream of it
    const isLockedByProduction = !!slot && slot.statuses.production !== "waiting";
    const isPickable = canEdit && !isLockedByProduction;

    const isDirty = !!artwork && (status !== artwork.status || type !== artwork.type);

    const onSave = async () => {
        try {
            await updateSlot({ project, number, statuses: { artwork: { status, type } } }).unwrap();
            onClose();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to update artwork" });
        }
    };

    return (
        <Modal isOpen={isOpen} placement="center" onOpenChange={(open) => !open && onClose()}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <span>Artwork</span>
                    <span className="text-xs sm:text-sm font-normal text-foreground/50">
                        Tracks this card's artwork from being obtained, through checking, to a finalised piece.
                    </span>
                </ModalHeader>
                <ModalBody className="gap-4 pb-2">
                    {isLoading || !artwork ? (
                        <Skeleton className="h-24 w-full rounded-md" />
                    ) : (
                        <>
                            {isLockedByProduction && canEdit && <ProductionLockAlert lane="artwork" />}
                            <StatusStepper
                                steps={steps}
                                currentIndex={artworkLane.statuses.indexOf(status)}
                                committedIndex={artworkLane.statuses.indexOf(artwork.status)}
                                color={artworkLane.color}
                                size="md"
                                className="pt-2"
                                isDisabled={isLockedByProduction}
                                onStepPress={isPickable ? (key) => setStatus(key as ArtworkStatus) : undefined}
                            />
                            <StatusStepDetail steps={steps} selectedKey={status} />
                            <Select
                                label="Type"
                                isDisabled={!isPickable}
                                selectedKeys={type ? [type] : []}
                                onSelectionChange={(keys) => setType([...keys][0] as ArtworkType | undefined)}
                            >
                                {artworkTypes.map((option) => (
                                    <SelectItem
                                        key={option}
                                        textValue={artworkTypeNames[option]}
                                        description={artworkTypeDescriptions[option]}
                                    >
                                        {artworkTypeNames[option]}
                                    </SelectItem>
                                ))}
                            </Select>
                        </>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button onPress={onClose}>{canEdit ? "Cancel" : "Close"}</Button>
                    {canEdit && (
                        <Button color="primary" isDisabled={isLoading || isSaving || !isDirty} onPress={onSave}>
                            Save
                        </Button>
                    )}
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type ArtworkProgressModalProps = {
    isOpen: boolean;
    onClose: () => void;
    project: number;
    number: number;
};
