import { addToast, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import Permission from "common/models/permissions";
import PermissionGate from "../../../components/permissionGate";
import { IProject } from "common/models/projects";
import { BaseElementProps } from "../../../types";
import { useCallback, useMemo, useState } from "react";
import { useGetCardsQuery, useGetSlotsQuery, useInitialiseProjectMutation } from "../../../api";
import { faCrow, faExclamationCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { showApiErrorToast } from "../../../api/errors";

export default function ProjectHeaderDraftNotice({ className, style, project }: ProjectHeaderDraftNoticeProps) {
    const { data: cardsData } = useGetCardsQuery({ filter: { project: project.number, draft: true } });
    const { data: slotsData } = useGetSlotsQuery({ project: project.number });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [initialiseProject, { isLoading: isInitialising }] = useInitialiseProjectMutation();

    const errorMessage = useMemo(() => {
        if (!project || !project.draft || !cardsData || !slotsData) {
            return false;
        }

        const slotCounts = slotsData.items.map((slot) => cardsData.items.filter((item) => item.number === slot.number).length);

        if (slotCounts.some((count) => count === 0)) {
            return "You cannot initialise a project without filling all available card slots. Either add cards to all missing slots, or remove empty slots.";
        }

        if (slotCounts.some((count) => count > 1)) {
            return "You cannot initialise a project with multiple card options available. Ensure each card slot has only have a single card remaining.";
        }

        return null;
    }, [cardsData, slotsData, project]);

    const onSubmit = useCallback(async () => {
        try {
            await initialiseProject(project).unwrap();
            setIsModalOpen(false);
            addToast({ title: "Successfully initialised", color: "success", description: `${project.name} has been initialised` });
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Initialise" });
        }
    }, [initialiseProject, project]);

    if (!cardsData) {
        return null;
    }
    return (
        <div className={classNames("bg-content1 p-4 flex flex-col gap-2", className)} style={style}>
            <div className="font-cinzel text-lg md:text-xl"><FontAwesomeIcon icon={faCrow} /> The Project Awaits Its First Raven...</div>
            <div className="font-sans text-sm md:text-base text-foreground/70">
        This project is in an experimental phase where it can be freely edited or reset as the initial concept is finalised. Once moved to Active status, the card designs are locked into their first official versions and any future changes will be formally tracked.
            </div>
            <PermissionGate requires={Permission.INITIALISE_PROJECTS}>
                <Button variant="flat" className="mt-2 w-full md:text-lg font-cinzel" onPress={() => setIsModalOpen(true)}>
                    Initialise Project
                </Button>
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="lg" placement="center">
                    <ModalContent>
                        {(onClose) => (
                            <>
                                <ModalHeader className="font-cinzel text-medium lg:text-large">Send the Raven?</ModalHeader>
                                <ModalBody className="font-sans">
                                    <span className="text-small lg:text-medium">The project will become Active — card counts will be sealed and all chosen cards locked into their first official versions.</span>
                                    <span className="text-small lg:text-medium">This marks the official start of playtesting, and is generally a good time to announce it to the community.</span>
                                    {!errorMessage
                                        ? <span>Do you wish to proceed?</span>
                                        : <div className="text-danger animate-pulse text-small lg:text-medium"><FontAwesomeIcon icon={faExclamationCircle} /> {errorMessage}</div>
                                    }
                                </ModalBody>
                                <ModalFooter>
                                    <Button onPress={onClose}>Turn Back</Button>
                                    <Button color="primary" isDisabled={!!errorMessage} onPress={onSubmit} isLoading={isInitialising}>Proceed</Button>
                                </ModalFooter>
                            </>
                        )}
                    </ModalContent>
                </Modal>
            </PermissionGate>
        </div>
    );
};

type ProjectHeaderDraftNoticeProps = Omit<BaseElementProps, "children"> & {
    project: IProject;
}