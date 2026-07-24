import { faLayerGroup, faGamepad, faScroll } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Link, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { BaseElementProps } from "../../types";

const THRONESDB_URL = "https://thronesdb.com";

const steps: { icon: IconDefinition, title: string, description: React.ReactNode }[] = [
    {
        icon: faLayerGroup,
        title: "Find a deck",
        description: <>Build one on <Link href={THRONESDB_URL} target="_blank" rel="noreferrer" size="sm">ThronesDB</Link>, or grab one from a card's page on this site.</>
    },
    {
        icon: faGamepad,
        title: "Playtest",
        description: "Play online, or print-and-play physically with friends."
    },
    {
        icon: faScroll,
        title: "Submit a review",
        description: "Share your thoughts on the cards you played with."
    }
];

export default function PlaytestOnboardingModal({ isOpen, onClose }: PlaytestOnboardingModalProps) {
    return (
        <Modal isOpen={isOpen} placement="center" size="2xl" onOpenChange={(open) => !open && onClose()}>
            <ModalContent>
                {(close) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1 font-cinzel text-2xl">
                            How do I playtest?
                        </ModalHeader>
                        <ModalBody className="pb-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {steps.map((step) => (
                                    <div key={step.title} className="flex flex-col items-center text-center gap-2 border border-content3 bg-content1 rounded-lg p-4">
                                        <FontAwesomeIcon icon={step.icon} size="2x" className="text-primary" />
                                        <div className="font-cinzel font-semibold">{step.title}</div>
                                        <div className="text-sm text-foreground/70">{step.description}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 border border-content3 bg-content2 rounded-lg p-3 mt-1">
                                <div className="flex-1 text-sm text-foreground/70">
                                    Short on time? Share your initial impressions with a review — games are preferred, but not required.
                                </div>
                                <Button as={Link} href="/review/submit" color="primary" size="sm" className="font-cinzel shrink-0 font-semibold" onPress={close}>
                                    Submit a Review
                                </Button>
                            </div>
                            <div className="text-xs text-foreground/60 text-center">
                                Have questions along the way? Drop by <span className="font-semibold">#playtest-chat</span> on Discord.
                            </div>
                        </ModalBody>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};

type PlaytestOnboardingModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    onClose: () => void;
};
