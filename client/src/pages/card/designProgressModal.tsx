import { useEffect, useState } from "react";
import {
    Alert,
    Button,
    Checkbox,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Skeleton
} from "@heroui/react";
import { DesignStatus, designPhase } from "common/models/slots";
import Permission from "common/models/permissions";
import { useGetSlotQuery, useSetSlotDesignStatusMutation, useUpdateSlotMutation } from "../../api";
import { usePermission } from "../../hooks/usePermission";
import { showApiErrorToast } from "../../api/errors";
import { designLane, laneSteps } from "../../constants";
import StatusStepper, { StatusStepDetail } from "../../components/statusStepper";
import ReleaseCheckTally from "../../components/releaseCheckTally";
import ProductionLockAlert from "./productionLockAlert";

export default function DesignProgressModal({ isOpen, onClose, project, number }: DesignProgressModalProps) {
    const { data: slot, isLoading } = useGetSlotQuery({ project, number });
    const [updateSlot, { isLoading: isUpdating }] = useUpdateSlotMutation();
    const [setSlotDesignStatus, { isLoading: isChangingPhase }] = useSetSlotDesignStatusMutation();
    const isSaving = isUpdating || isChangingPhase;

    const canEdit = usePermission(Permission.EDIT_SLOTS);
    const canApprove = usePermission(Permission.APPROVE_CARD_DESIGN);
    const canReadFeedback = usePermission(Permission.READ_RELEASE_CHECKS);

    const design = slot?.statuses.design;

    const [status, setStatus] = useState<DesignStatus | null>(null);
    useEffect(() => {
        setStatus(design?.status ?? null);
    }, [design?.status, isOpen]);

    const [acknowledged, setAcknowledged] = useState(false);
    useEffect(() => {
        setAcknowledged(false);
    }, [status, isOpen]);

    if (isLoading || !slot || !design) {
        return (
            <Modal isOpen={isOpen} size="lg" placement="center" onOpenChange={(open) => !open && onClose()}>
                <ModalContent>
                    <ModalHeader>Design</ModalHeader>
                    <ModalBody className="pb-6">
                        <Skeleton className="h-48 w-full rounded-md" />
                    </ModalBody>
                </ModalContent>
            </Modal>
        );
    }

    const phase = designPhase[design.status];
    const pendingStatus = status ?? design.status;
    const isDirty = pendingStatus !== design.status;
    const isPhaseChange = designPhase[pendingStatus] !== phase;
    const isReopening = isPhaseChange && phase === "finalising";

    // Why a given status can't be picked right now; undefined means selectable
    const lockReason = (option: DesignStatus): string | undefined => {
        if (option === design.status) {
            return undefined;
        }
        if (designPhase[option] === phase) {
            return canEdit ? undefined : "Requires slot editing permission";
        }
        return canApprove ? undefined : "Requires design approval permission";
    };

    // Design is frozen once a card file exists downstream of it
    const isLockedByProduction = slot.statuses.production !== "waiting";
    const isPickable = (canEdit || canApprove) && !isLockedByProduction;
    const steps = laneSteps(designLane).map((step) => {
        const reason = lockReason(step.key as DesignStatus);
        return { ...step, isDisabled: isPickable && !!reason, disabledReason: reason };
    });

    const onSave = async () => {
        try {
            if (isPhaseChange) {
                await setSlotDesignStatus({ project, number, status: pendingStatus }).unwrap();
            } else {
                await updateSlot({ project, number, statuses: { design: { status: pendingStatus } } }).unwrap();
            }
            onClose();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to update design status" });
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            size="lg"
            placement="center"
            scrollBehavior="inside"
            onOpenChange={(open) => !open && onClose()}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <span>Design</span>
                    <span className="text-xs sm:text-sm font-normal text-foreground/50">
                        Tracks this card's design from its prerelease preview, through forging & playtesting, to
                        finalised wording.
                    </span>
                </ModalHeader>
                <ModalBody className="gap-4 pb-2">
                    {isLockedByProduction && (canEdit || canApprove) && <ProductionLockAlert lane="design" />}
                    <StatusStepper
                        steps={steps}
                        currentIndex={designLane.statuses.indexOf(pendingStatus)}
                        committedIndex={designLane.statuses.indexOf(design.status)}
                        color={designLane.color}
                        size="md"
                        className="pt-2"
                        isDisabled={isLockedByProduction}
                        onStepPress={isPickable ? (key) => setStatus(key as DesignStatus) : undefined}
                    />
                    <StatusStepDetail steps={steps} selectedKey={pendingStatus} />

                    {isPickable && isPhaseChange && (
                        <Alert
                            color={isReopening ? "danger" : "primary"}
                            variant="faded"
                            description={
                                isReopening
                                    ? "Saving will reopen this card's design, clearing its final approval."
                                    : "Saving will approve this card's design, locking it in."
                            }
                        >
                            {!isReopening && canReadFeedback && (
                                <ReleaseCheckTally project={project} number={number} className="mt-2" showBar={false} />
                            )}
                            <Checkbox
                                size="sm"
                                color={isReopening ? "danger" : "primary"}
                                className="mt-1"
                                isSelected={acknowledged}
                                onValueChange={setAcknowledged}
                            >
                                <span className="text-sm">I understand</span>
                            </Checkbox>
                        </Alert>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button onPress={onClose}>{isPickable ? "Cancel" : "Close"}</Button>
                    {isPickable && (
                        <Button
                            color={isReopening ? "danger" : "primary"}
                            isDisabled={isSaving || !isDirty || (isPhaseChange && !acknowledged)}
                            onPress={() => void onSave()}
                        >
                            Save
                        </Button>
                    )}
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type DesignProgressModalProps = {
    isOpen: boolean;
    onClose: () => void;
    project: number;
    number: number;
};
