import {
    faCircleCheck,
    faDove,
    faListOl,
    faSliders,
    faSquarePlus,
    faTableCellsLarge
} from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";

// In the order a draft is worked through
const STEPS: { icon: IconDefinition; title: string; description: string }[] = [
    {
        icon: faTableCellsLarge,
        title: "Lay Out the Slots",
        description: "In the project editor, pick a template or set how many slots each faction has."
    },
    {
        icon: faSliders,
        title: "Set Conditions",
        description:
            "Say what each slot is looking for. A card that doesn't fit can still go in, and carries a warning."
    },
    {
        icon: faSquarePlus,
        title: "Add Options",
        description: "Give each slot one card or several to choose between - new designs or approved suggestions."
    },
    {
        icon: faListOl,
        title: "Rank & Move",
        description:
            "The card on top is a slot's Favoured. Arrange the rest by preference, or drag a card to another slot."
    },
    {
        icon: faCircleCheck,
        title: "Settle Each Slot",
        description: "Narrow every slot down to the one card it will start with, removing the rest."
    },
    {
        icon: faDove,
        title: "Send the Raven",
        description: "With one card in every slot, initialise the project to end the draft and begin playtesting."
    }
];

export default function DraftingGuideModal({ isOpen, onClose }: DraftingGuideModalProps) {
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
                            <span className="font-cinzel text-lg sm:text-2xl">Drafting Guide</span>
                            <span className="text-sm font-normal text-foreground/60">
                                A draft is where a project's first cards are chosen, slot by slot, before anyone
                                playtests them.
                            </span>
                        </ModalHeader>
                        <ModalBody className="pb-4 sm:pb-6">
                            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                {STEPS.map((step) => (
                                    <li
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
                                    </li>
                                ))}
                            </ol>
                            <div className="border border-content3 bg-content2 rounded-lg p-3 text-sm text-foreground/70">
                                Nothing here is final until the project is initialised - slots, conditions and cards can
                                all be changed as the draft takes shape.
                            </div>
                            <div className="flex justify-end">
                                <Button variant="flat" size="sm" className="font-cinzel font-semibold" onPress={close}>
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

type DraftingGuideModalProps = {
    isOpen: boolean;
    onClose: () => void;
};
