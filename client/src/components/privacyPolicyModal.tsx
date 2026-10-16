import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import Modal from "./modal";
import PrivacyPolicy from "./privacyPolicy";

export default function PrivacyPolicyModal({ isOpen, onClose: onModalClose = () => true }: PrivacyPolicyModalProps) {
    return (
        <Modal isOpen={isOpen} size="2xl" onOpenChange={(isOpen) => !isOpen && onModalClose()}>
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader>Privacy Policy</ModalHeader>
                        <ModalBody>
                            <PrivacyPolicy />
                        </ModalBody>
                        <ModalFooter>
                            <Button color="primary" onPress={onClose}>
                                Close
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

type PrivacyPolicyModalProps = {
    isOpen: boolean;
    onClose?: () => void;
};
