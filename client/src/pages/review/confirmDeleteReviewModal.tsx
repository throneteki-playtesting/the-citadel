import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

export default function ConfirmDeleteReviewModal({
    isOpen,
    cardName,
    isDeleting,
    onConfirm,
    onCancel
}: ConfirmDeleteReviewModalProps) {
    return (
        <Modal isOpen={isOpen} placement="center" size="md" onOpenChange={(open) => !open && onCancel()}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <span>Delete this review?</span>
                    <span className="text-xs sm:text-sm font-normal text-foreground/50">This cannot be undone.</span>
                </ModalHeader>
                <ModalBody>
                    <p className="text-sm">
                        This will permanently remove the review for <span className="font-semibold">{cardName}</span>.
                    </p>
                </ModalBody>
                <ModalFooter>
                    <Button isDisabled={isDeleting} onPress={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        color="danger"
                        isLoading={isDeleting}
                        startContent={!isDeleting && <FontAwesomeIcon icon={faTrash} />}
                        onPress={onConfirm}
                    >
                        Delete Review
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type ConfirmDeleteReviewModalProps = {
    isOpen: boolean;
    cardName: string;
    isDeleting?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};
