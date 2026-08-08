import { useEffect, useMemo, useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { ArtworkStatus } from "common/models/slots";
import { inferredStatus, selectableStatuses } from "common/models/artwork";
import Permission from "common/models/permissions";
import { useGetArtistsQuery, useGetSlotQuery, useUpdateSlotMutation } from "../../../api";
import { usePermission } from "../../../hooks/usePermission";
import { showApiErrorToast } from "../../../api/errors";
import { artworkLane, laneSteps } from "../../../constants";
import StatusStepper, { StatusStepDetail } from "../../../components/statusStepper";
import StatusNotice from "../../../components/statusNotice";
import ProductionLockAlert from "../productionLockAlert";

const steps = laneSteps(artworkLane);

/**
 * Manual control of the artwork track alone. The status normally follows what happens on the Artwork
 * tab, so this exists for the two cases automation can't cover - signing a finished piece off, and
 * correcting a track which has got ahead of, or behind, reality.
 */
export default function ArtworkStatusModal({
    isOpen,
    onClose,
    onOpenArtwork,
    project,
    number
}: ArtworkStatusModalProps) {
    const { data: slot, isLoading } = useGetSlotQuery({ project, number });
    const canEdit = usePermission(Permission.EDIT_SLOTS);
    const canReadArtists = usePermission(Permission.READ_ARTISTS);
    const { data: artistsData } = useGetArtistsQuery(undefined, { skip: !canReadArtists });
    const [updateSlot, { isLoading: isSaving }] = useUpdateSlotMutation();

    const artwork = slot?.statuses.artwork;
    const [status, setStatus] = useState<ArtworkStatus>("pending");

    useEffect(() => {
        if (artwork) {
            setStatus(artwork.status);
        }
    }, [artwork, isOpen]);

    // Artwork is frozen once a card file exists downstream of it
    const isLockedByProduction = !!slot && slot.statuses.production !== "waiting";
    const isPickable = canEdit && !isLockedByProduction;
    const isDirty = !!artwork && status !== artwork.status;

    const artists = useMemo(() => artistsData?.items ?? [], [artistsData?.items]);
    // Blanket permission can't be judged without the artist list, so the gate is left to the server
    const selectable = useMemo(
        () => (artwork && canReadArtists ? selectableStatuses(artwork, artists) : []),
        [artwork, canReadArtists, artists]
    );
    const blockedReasons = useMemo(
        () => new Map(selectable.filter((entry) => entry.blocker).map((entry) => [entry.status, entry.blocker!])),
        [selectable]
    );

    // A status the details can't support is shown greyed with its reason, rather than picked then refused
    const pickableSteps = useMemo(
        () =>
            steps.map((step) => {
                const reason = blockedReasons.get(step.key as ArtworkStatus);
                return { ...step, isDisabled: !!reason, disabledReason: reason };
            }),
        [blockedReasons]
    );

    // Worth saying out loud when a manual pick is one the next detail change would undo. Complete is the
    // exception - automation never awards it, so choosing it is never second-guessed
    const willBeOverridden =
        !!artwork &&
        canReadArtists &&
        status !== "complete" &&
        !blockedReasons.has(status) &&
        inferredStatus({ ...artwork, status }, artists) !== status;

    const onSave = async () => {
        try {
            await updateSlot({ project, number, statuses: { artwork: { status } } }).unwrap();
            onClose();
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to update artwork" });
        }
    };

    return (
        <Modal isOpen={isOpen} placement="center" onOpenChange={(open) => !open && onClose()}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <span>Artwork Status</span>
                    <span className="text-xs sm:text-sm font-normal text-foreground/50">
                        The track normally follows the work itself. Set it by hand here to sign a finished piece off, or
                        to correct it.
                    </span>
                </ModalHeader>
                <ModalBody className="gap-4 pb-2">
                    {isLoading || !artwork ? (
                        <Skeleton className="h-24 w-full rounded-md" />
                    ) : (
                        <>
                            {isLockedByProduction && canEdit && <ProductionLockAlert lane="artwork" />}
                            <StatusStepper
                                steps={pickableSteps}
                                currentIndex={artworkLane.statuses.indexOf(status)}
                                committedIndex={artworkLane.statuses.indexOf(artwork.status)}
                                color={artworkLane.color}
                                size="md"
                                className="pt-2"
                                isDisabled={isLockedByProduction}
                                onStepPress={isPickable ? (key) => setStatus(key as ArtworkStatus) : undefined}
                            />
                            <StatusStepDetail steps={pickableSteps} selectedKey={status} />
                            {willBeOverridden && (
                                <StatusNotice
                                    icon={faTriangleExclamation}
                                    tone="warning"
                                    label="This may not stick"
                                    detail="The artwork's own details point elsewhere, so the next change made on the Artwork tab will set the status again."
                                />
                            )}
                            <Button
                                variant="light"
                                className="self-start px-1"
                                endContent={<FontAwesomeIcon icon={faArrowRight} />}
                                onPress={onOpenArtwork}
                            >
                                Open the full Artwork section
                            </Button>
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

type ArtworkStatusModalProps = {
    isOpen: boolean;
    onClose: () => void;
    /** Closes the modal and takes the reader to the artwork detail itself */
    onOpenArtwork: () => void;
    project: number;
    number: number;
};
