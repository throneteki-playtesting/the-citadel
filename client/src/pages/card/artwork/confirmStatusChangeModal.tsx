import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { ArtworkStatus } from "common/models/slots";
import { artworkLane } from "../../../constants";
import StatusNotice from "../../../components/statusNotice";

// A status moving is a statement about the card, so it is agreed to rather than discovered afterwards
export default function ConfirmStatusChangeModal({
    isOpen,
    from,
    to,
    reason,
    isSaving,
    onConfirm,
    onCancel
}: ConfirmStatusChangeModalProps) {
    // Losing ground is worth saying plainly - it means work the track was claiming is no longer backed up
    const isRetreat = artworkLane.statuses.indexOf(to) < artworkLane.statuses.indexOf(from);

    return (
        <Modal isOpen={isOpen} placement="center" size="md" onOpenChange={(open) => !open && onCancel()}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <span>{isRetreat ? "Saving will move the artwork back" : "Saving will move the artwork on"}</span>
                    <span className="text-xs sm:text-sm font-normal text-foreground/50">
                        {isRetreat
                            ? "The details no longer support where the track is, so it gives the ground up."
                            : "These changes take the track somewhere new."}
                    </span>
                </ModalHeader>
                <ModalBody className="gap-4">
                    <div
                        className={classNames(
                            "flex items-center justify-center gap-4 py-2",
                            isRetreat && "flex-row-reverse"
                        )}
                    >
                        <Step status={from} />
                        <FontAwesomeIcon
                            icon={isRetreat ? faArrowLeft : faArrowRight}
                            className={isRetreat ? "text-warning" : "text-foreground/30"}
                        />
                        <Step status={to} color="primary" />
                    </div>
                    <p className="text-center text-sm text-foreground/60">{reason}</p>
                    {isRetreat && (
                        <StatusNotice
                            icon={faTriangleExclamation}
                            color="warning"
                            label="This gives up progress"
                            detail={`${artworkLane.meta[from].label} will no longer be recorded against this card.`}
                        />
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button onPress={onCancel}>Cancel</Button>
                    <Button color="primary" isDisabled={isSaving} onPress={onConfirm}>
                        {isRetreat ? "Save and step back" : "Save and move on"}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function Step({ status, color }: { status: ArtworkStatus; color?: "primary" | "warning" }) {
    const meta = artworkLane.meta[status];

    return (
        <div className="flex flex-col items-center gap-1.5 w-28">
            <div
                className={classNames(
                    "flex items-center justify-center size-12 rounded-full border",
                    color === "primary" && "border-primary bg-primary/10 text-primary",
                    color === "warning" && "border-warning bg-warning/10 text-warning",
                    !color && "border-content3 text-foreground/40"
                )}
            >
                <FontAwesomeIcon icon={meta.icon} className="text-lg" />
            </div>
            <span
                className={classNames(
                    "font-cinzel uppercase tracking-wide text-xs text-center",
                    color === "primary" && "text-primary",
                    color === "warning" && "text-warning",
                    !color && "text-foreground/40"
                )}
            >
                {meta.label}
            </span>
        </div>
    );
}

type ConfirmStatusChangeModalProps = {
    isOpen: boolean;
    from: ArtworkStatus;
    to: ArtworkStatus;
    /** Why the details put it there, in the same words the gate would use */
    reason: string;
    isSaving?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};
