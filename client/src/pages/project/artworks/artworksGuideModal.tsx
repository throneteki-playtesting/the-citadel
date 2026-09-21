import { faListCheck, faPalette, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { BaseElementProps } from "../../../types";

const STEPS: { icon: IconDefinition; title: string; description: string }[] = [
    {
        icon: faUserPlus,
        title: "Assign an Owner",
        description: "Give the piece someone to belong to, so it's clear who's driving it."
    },
    {
        icon: faPalette,
        title: "Pick a Type",
        description: "Sourced, commissioned, or AI generated - choose how the art will be obtained."
    },
    {
        icon: faListCheck,
        title: "Follow the Checklist",
        description: "Work through the checklist for your chosen type - it only asks for what that type actually needs."
    }
];

/** Same "row of bordered step cards" language as the home page's How-To-Playtest guide - a static
 *  overview, not a stepped flow, since there's nothing here a viewer needs to do in order. */
export default function ArtworksGuideModal({ isOpen, onClose }: ArtworksGuideModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            placement="center"
            size="3xl"
            scrollBehavior="inside"
            className="max-h-[90vh]"
            onOpenChange={(open) => !open && onClose()}
        >
            <ModalContent>
                {(close) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1">
                            <span className="font-cinzel text-lg sm:text-2xl">Artwork Guide</span>
                            <span className="text-sm font-normal text-foreground/60">
                                This section tracks the artwork data and progress of every card in this project.
                            </span>
                        </ModalHeader>
                        <ModalBody className="pb-4 sm:pb-6">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                {STEPS.map((step) => (
                                    <div
                                        key={step.title}
                                        className="flex flex-col items-center text-center gap-1 sm:gap-2 border border-content3 bg-content1 rounded-lg p-3 sm:p-4"
                                    >
                                        <FontAwesomeIcon
                                            icon={step.icon}
                                            className="text-primary text-3xl sm:text-5xl"
                                        />
                                        <div className="font-cinzel font-semibold text-sm sm:text-base">
                                            {step.title}
                                        </div>
                                        <div className="text-xs sm:text-sm text-foreground/70">{step.description}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 border border-content3 bg-content2 rounded-lg p-3">
                                <div className="flex-1 text-sm text-foreground/70">
                                    Status keeps itself up to date as the details come together - but marking a piece
                                    Complete is always a manual, final call.
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <div className="flex-1 text-xs text-foreground/60 text-center">
                                    Have questions along the way? Drop by{" "}
                                    <span className="font-semibold">#art-chat</span> on Discord.
                                </div>
                                <Button
                                    variant="flat"
                                    size="sm"
                                    className="font-cinzel font-semibold shrink-0 self-end sm:self-auto"
                                    onPress={close}
                                >
                                    Got it
                                </Button>
                            </div>
                        </ModalBody>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

type ArtworksGuideModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    onClose: () => void;
};
