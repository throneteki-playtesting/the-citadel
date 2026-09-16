import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, type ModalProps } from "@heroui/react";
import { ReactNode } from "react";
import { BaseElementProps, UIColor } from "../types";

export default function ConfirmModal({
    isOpen,
    isLoading = false,
    title,
    content,
    confirmContent = "Confirm",
    cancelContent = "Cancel",
    confirmColor = "danger",
    size = "sm",
    onClose: onModalClose = () => true,
    onConfirm = () => true
}: ConfirmModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            placement="top-center"
            onOpenChange={(isOpen) => !isOpen && onModalClose()}
            size={size}
            // Locked while the confirmed action is in flight - a stray Escape/backdrop click (or the
            // Cancel button below) must not dismiss this out from under a request that's still running.
            isDismissable={!isLoading}
            isKeyboardDismissDisabled={isLoading}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader>{title}</ModalHeader>
                        <ModalBody>{content}</ModalBody>
                        <ModalFooter>
                            <Button color="default" isDisabled={isLoading} onPress={onClose}>
                                {cancelContent}
                            </Button>
                            <Button color={confirmColor} isLoading={isLoading} onPress={onConfirm}>
                                {confirmContent}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

type ConfirmModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    isLoading?: boolean;
    title?: ReactNode;
    content?: ReactNode;
    confirmContent?: ReactNode;
    cancelContent?: ReactNode;
    /** Defaults to "danger" - every existing caller here is a destructive action; pass eg. "primary"
     *  for a confirmation that isn't one (eg. approving early). */
    confirmColor?: UIColor;
    /** Defaults to "sm" - widen for a longer description that would otherwise wrap awkwardly. */
    size?: ModalProps["size"];
    onClose?: () => void;
    onConfirm?: () => void;
};
