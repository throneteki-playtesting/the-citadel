import { addToast, Alert, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import Permission from "common/models/permissions";
import PermissionGate from "../../../components/permissionGate";
import { IProject } from "common/models/projects";
import { BaseElementProps } from "../../../types";
import { useCallback, useMemo, useState } from "react";
import { useGetCardsQuery, useInitialiseProjectMutation } from "../../../api";

export default function ProjectHeaderDraftNotice({ className, style, project }: ProjectHeaderDraftNoticeProps) {
    const { data: cardsData } = useGetCardsQuery({ filter: { project: project.number, draft: true } });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [initialiseProject, { isLoading: isInitialising }] = useInitialiseProjectMutation();

    const canInitialise = useMemo(() => {
        if (!project || !project.draft || !cardsData) {
            return false;
        }

        const totalSlots = Object.values(project.cardCount).reduce((arr, num) => arr + num, 0);
        return totalSlots === cardsData.total;
    }, [cardsData, project]);

    const onSubmit = useCallback(async () => {
        try {
            await initialiseProject(project).unwrap();
            setIsModalOpen(false);
            addToast({ title: "Successfully initialised", color: "success", description: `${project.name} has been initialised` });
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to delete", color: "danger", description: "An unknown error has occurred" });
        }
    }, [initialiseProject, project]);

    if (!cardsData) {
        return null;
    }
    return (
        <Alert color="secondary" title={<span className="font-bold text-sm md:text-md lg:text-lg">Project in Draft</span>} className={className} style={style}>
            <span className="text-xs md:text-sm lg:text-md italic">Project is in an experimental phase where the it can be freely edited or reset as the initial concept is finalised. Once moved to Active status, the card designs are locked into their first official versions and any future changes will be formally tracked.</span>
            <PermissionGate requires={Permission.INITIALISE_PROJECTS}>
                <Button variant="flat" className="mt-2 w-full md:text-lg font-bold" onPress={() => setIsModalOpen(true)}>Initialise</Button>
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="lg" placement="top-center">
                    <ModalContent>
                        {(onClose) => (
                            <>
                                <ModalHeader className="text-medium lg:text-large">Initialise Project?</ModalHeader>
                                <ModalBody>
                                    <span className="text-small lg:text-medium">Project will become "Active", which prevents further changes to card counts & locks all chosen cards into their first official versions.</span>
                                    <span className="text-small lg:text-medium">It will officially lock this project into playtesting, and is generally a good time to announce it to the community.</span>
                                    {canInitialise
                                        ? <span>Would you like to continue?</span>
                                        : <Alert color="danger" title={<span className="text-medium lg:text-large">Warning</span>} className="animate-pulse text-small lg:text-medium">You cannot initialise a project without filling all available card slots. Either add cards to all missing slots, or edit project card counts.</Alert>
                                    }
                                </ModalBody>
                                <ModalFooter>
                                    <Button onPress={onClose}>Cancel</Button>
                                    <Button color="primary" isDisabled={!canInitialise} onPress={onSubmit} isLoading={isInitialising}>Initialise</Button>
                                </ModalFooter>
                            </>
                        )}
                    </ModalContent>
                </Modal>
            </PermissionGate>
        </Alert>
    );
};

type ProjectHeaderDraftNoticeProps = Omit<BaseElementProps, "children"> & {
    project: IProject
}