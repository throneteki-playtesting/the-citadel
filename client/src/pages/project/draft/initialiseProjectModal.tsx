import { addToast, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { faBoxArchive, faBoxOpen, faCirclePlay, faLock, faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IPlaytestCard } from "common/models/cards";
import { IProject } from "common/models/projects";
import { pluralize } from "common/utils";
import { useInitialiseProjectMutation } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";

// Spells out what initialising does before it is done, since none of it can be taken back
export default function InitialiseProjectModal({
    isOpen,
    project,
    cards,
    isReady,
    onClose
}: InitialiseProjectModalProps) {
    const [initialiseProject, { isLoading: isInitialising }] = useInitialiseProjectMutation();

    const suggestionCount = cards.filter((card) => card.suggestionId).length;
    const outcomes = [
        {
            icon: faCirclePlay,
            content: (
                <>
                    Make the project <b>Active</b> - its slots are sealed, and can no longer be added or removed
                </>
            )
        },
        {
            icon: faLock,
            content: (
                <>
                    Lock {cards.length} {pluralize(cards.length, "card")} in as <b>version 1.0.0</b>, with every later
                    change tracked through playtesting updates
                </>
            )
        },
        project.type === "expansion" && {
            icon: faBoxOpen,
            content: "Create a single release for the expansion, holding every card"
        },
        suggestionCount > 0 && {
            icon: faBoxArchive,
            content: (
                <>
                    Archive {suggestionCount} {pluralize(suggestionCount, "suggestion")} as used in this project,
                    closing their Discord threads
                </>
            )
        },
        { icon: faRotate, content: "Start syncing every card - images, Discord threads and GitHub issues" }
    ].flatMap((outcome) => (outcome ? [outcome] : []));

    const onProceed = async () => {
        try {
            await initialiseProject(project).unwrap();
            onClose();
            addToast({
                title: "Successfully initialised",
                color: "success",
                description: `${project.name} has been initialised`
            });
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Initialise" });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg" placement="center">
            <ModalContent>
                <ModalHeader className="font-cinzel text-medium lg:text-large">Send the Raven?</ModalHeader>
                <ModalBody className="font-sans text-small lg:text-medium">
                    <span className="text-foreground/70">
                        Initialising ends the draft, where everything could be freely reworked or reset. From here the
                        project is in playtesting, and proceeding will:
                    </span>
                    <ul className="flex flex-col divide-y divide-content3">
                        {outcomes.map(({ icon, content }) => (
                            <li key={icon.iconName} className="flex items-center gap-3 py-2">
                                <FontAwesomeIcon icon={icon} fixedWidth className="shrink-0 text-xl text-primary" />
                                <span>{content}</span>
                            </li>
                        ))}
                    </ul>
                    <span className="text-xs text-foreground/50">
                        This marks the official start of playtesting, and is a good time to announce it to the
                        community.
                    </span>
                </ModalBody>
                <ModalFooter>
                    <Button onPress={onClose}>Turn Back</Button>
                    <Button color="success" isDisabled={!isReady} onPress={onProceed} isLoading={isInitialising}>
                        Proceed
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type InitialiseProjectModalProps = {
    isOpen: boolean;
    project: IProject;
    cards: IPlaytestCard[];
    /** Re-checked while open, since the checklist can fall back if a slot changes underneath it */
    isReady: boolean;
    onClose: () => void;
};
