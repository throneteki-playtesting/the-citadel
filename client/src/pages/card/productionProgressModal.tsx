import { useEffect, useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Skeleton } from "@heroui/react";
import { ProductionStatus } from "common/models/slots";
import Permission from "common/models/permissions";
import { useGetSlotQuery, useUpdateSlotMutation } from "../../api";
import { usePermission } from "../../hooks/usePermission";
import { showApiErrorToast } from "../../api/errors";
import { laneSteps, productionLane } from "../../constants";
import StatusStepper, { StatusStepDetail } from "../../components/statusStepper";

export default function ProductionProgressModal({ isOpen, onClose, project, number }: ProductionProgressModalProps) {
    const { data: slot, isLoading } = useGetSlotQuery({ project, number });
    const [updateSlot, { isLoading: isSaving }] = useUpdateSlotMutation();
    const canEdit = usePermission(Permission.EDIT_SLOTS);

    const [status, setStatus] = useState<ProductionStatus>("waiting");
    useEffect(() => {
        if (slot) {
            setStatus(slot.statuses.production);
        }
    }, [slot]);

    // Production is downstream - nothing past Pending is selectable without a locked design and finished artwork
    const prerequisitesMet =
        !!slot && slot.statuses.design.status === "complete" && slot.statuses.artwork.status === "complete";
    const steps = laneSteps(productionLane).map((step) => {
        const isLocked = step.key !== "pending" && !prerequisitesMet;
        return {
            ...step,
            isDisabled: isLocked,
            disabledReason: isLocked ? "Requires a completed design and completed artwork" : undefined
        };
    });

    const isDirty = !!slot && status !== slot.statuses.production;

    const onSave = async () => {
        try {
            await updateSlot({ project, number, statuses: { production: status } }).unwrap();
            onClose();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to update production" });
        }
    };

    return (
        <Modal isOpen={isOpen} placement="center" onOpenChange={(open) => !open && onClose()}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <span>Production</span>
                    <span className="text-xs sm:text-sm font-normal text-foreground/50">
                        Tracks assembling this card's final file, once its design & artwork are both complete.
                    </span>
                </ModalHeader>
                <ModalBody className="gap-4 pb-2">
                    {isLoading || !slot ? (
                        <Skeleton className="h-24 w-full rounded-md" />
                    ) : (
                        <>
                            <StatusStepper
                                steps={steps}
                                currentIndex={productionLane.statuses.indexOf(status)}
                                committedIndex={productionLane.statuses.indexOf(slot.statuses.production)}
                                color={productionLane.color}
                                size="md"
                                className="pt-2"
                                onStepPress={canEdit ? (key) => setStatus(key as ProductionStatus) : undefined}
                            />
                            <StatusStepDetail steps={steps} selectedKey={status} />
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

type ProductionProgressModalProps = {
    isOpen: boolean;
    onClose: () => void;
    project: number;
    number: number;
};
