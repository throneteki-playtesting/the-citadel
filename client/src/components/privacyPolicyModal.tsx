import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import PrivacyPolicy from "./privacyPolicy";

export default function PrivacyPolicyModal({ isOpen, onClose: onModalClose = () => true }: PrivacyPolicyModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            placement="center"
            scrollBehavior="inside"
            size="2xl"
            onOpenChange={(isOpen) => !isOpen && onModalClose()}
        >
            <ModalContent className="max-h-[90vh]">
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
