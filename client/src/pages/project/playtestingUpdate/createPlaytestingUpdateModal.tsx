import { CardPreview } from "@agot/card-preview";
import { Accordion, AccordionItem, addToast, Alert, Card, Checkbox, Divider, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Skeleton, Textarea } from "@heroui/react";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../../components/wizard";
import { PlaytestingUpdate } from "common/models/schemas";
import { DeepPartial } from "common/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCreatePlaytestingUpdateMutation, useGetCardsQuery } from "../../../api";
import { renderPlaytestingCard, SemanticVersion, thronesColors } from "common/utils";
import { IPlaytestCard } from "common/models/cards";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { noteTypeIcon } from "../../../utils";
import { sortBy } from "lodash";
import ImplementStatus from "../../../components/status/implementStatus";

const CreatePlaytestingUpdateModal = ({ isOpen, project, onClose: onModalClose = () => true, onSave = () => true }: CreatePlaytestingUpdateModalProps) => {
    const { data: draftsData, isLoading: isDraftsLoading } = useGetCardsQuery({ filter: { project: project?.number, draft: true } });
    const [createPlaytestingUpdate, { isLoading }] = useCreatePlaytestingUpdateMutation();
    const [playtestingUpdate, setPlaytestingUpdate] = useState<DeepPartial<IPlaytestingUpdate>>({ project: project.number });

    const [selectedCards, setSelectedCards] = useState<IPlaytestCard[]>([]);

    useEffect(() => {
        // Initially selects all draft cards
        if (draftsData) {
            setSelectedCards(draftsData.items);
        }
    }, [draftsData]);

    useEffect(() => {
        const cardChanges = selectedCards.reduce<Record<number, SemanticVersion>>((updates, card) => {
            updates[card.number] = card.version;
            return updates;
        }, {});
        if (cardChanges) {
            setPlaytestingUpdate((prev) => ({
                ...prev,
                cardChanges
            }));
        }
    }, [selectedCards]);

    const toggleCard = useCallback((card: IPlaytestCard) => {
        const selected = selectedCards.find((selected) => selected.number === card.number && selected.version === card.version);

        if (selected) {
            setSelectedCards((prev) => prev.filter((p) => p !== selected));
        } else {
            setSelectedCards((prev) => [...prev, card]);
        }
    }, [selectedCards]);

    const onSubmit = useCallback(async (playtestingUpdate: IPlaytestingUpdate) => {
        setPlaytestingUpdate(playtestingUpdate);
        try {
            const { playtestingUpdate: newPlaytestingUpdate } = await createPlaytestingUpdate(playtestingUpdate).unwrap();
            onSave(newPlaytestingUpdate);
            onModalClose();
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to save", color: "danger", description: "An unknown error has occurred" });
        }
    }, [createPlaytestingUpdate, onModalClose, onSave]);

    const draftCardSelectors = useMemo(() => {
        if (isDraftsLoading) {
            return <Skeleton className="w-full h-44 rounded-xl" />;
        }

        if (!draftsData?.items) {
            return null;
        }

        return sortBy(draftsData?.items, ["faction", "type"]).map((card) => {
            const isSelected = selectedCards.some((selected) => selected.number === card.number && selected.version === card.version);
            return (
                <Card className={classNames("w-full p-2 border-2", { "brightness-50": !isSelected })} style={{ borderColor: thronesColors[card.faction] }}>
                    <div className="grow flex flex-col">
                        <Accordion>
                            <AccordionItem
                                textValue={card.name}
                                classNames={{ trigger: "p-0" }}
                                title={
                                    <div className="flex gap-2 items-center">
                                        <Checkbox className="p-0" isSelected={isSelected} onValueChange={() => toggleCard(card)}/>
                                        <div className="text-large font-semibold">
                                            {card.name} (v{card.version})
                                        </div>
                                    </div>
                                }
                            >
                                <Divider className="mb-3"/>
                                <div className="w-full flex justify-center">
                                    <div className="w-2/3">
                                        <CardPreview card={renderPlaytestingCard(card)} rounded />
                                    </div>
                                </div>
                            </AccordionItem>
                        </Accordion>
                        <Divider className="my-1"/>
                        <div className="px-1">
                            {card.note ? (
                                <>
                                    <div className="text-medium capitalize font-semibold"><FontAwesomeIcon icon={noteTypeIcon[card.note.type]}/> {card.note.type}</div>
                                    <div className="text-small">{card.note.text}</div>
                                </>
                            ) : <Alert color="danger" className="text-small" title="No change note found!">This should not be possible, and likely indicates something went wrong.</Alert>}
                        </div>
                        <Divider className="my-1"/>
                        <div className="flex flex-col gap-1">
                            <ImplementStatus card={card}/>
                        </div>
                    </div>
                </Card>
            );
        });
    }, [draftsData?.items, isDraftsLoading, selectedCards, toggleCard]);

    return (
        <Modal isOpen={isOpen} placement="top-center" onOpenChange={(isOpen) => !isOpen && onModalClose() }>
            <ModalContent>
                {(onClose) => (
                    <Wizard
                        schema={PlaytestingUpdate.Draft}
                        onSubmit={onSubmit}
                        data={playtestingUpdate}
                    >
                        <ModalHeader>{`Create ${project.code} Playtesting Update #${project.version + 1}`}</ModalHeader>
                        <ModalBody>
                            <WizardPages>
                                <WizardPage className="flex flex-col p-2 gap-2">
                                    <div className="text-medium font-semibold">Select Drafted Cards</div>
                                    <div className="text-small">Expand the card name to view the changed version.</div>
                                    <div className="text-tiny"><FontAwesomeIcon icon={faInfoCircle}/> Any cards which are not implemented will need to be manually playtested online until they are implemented.</div>
                                    <div className="flex flex-col gap-2 w-full">
                                        {draftCardSelectors}
                                    </div>
                                </WizardPage>
                                <WizardPage>
                                    <div className="text-medium font-semibold">Describe the update</div>
                                    <div className="text-small">This is optional, but helps tell playtesters any broad details about this update.</div>
                                    <Textarea label="Description"/>
                                </WizardPage>
                            </WizardPages>
                        </ModalBody>
                        <ModalFooter>
                            <WizardBack onCancel={onClose}/>
                            <WizardNext isLoading={isLoading} color="primary"/>
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
};

type CreatePlaytestingUpdateModalProps = { isOpen: boolean, project: IProject, onClose?: () => void, onSave?: (project: IPlaytestingUpdate) => void };

export default CreatePlaytestingUpdateModal;