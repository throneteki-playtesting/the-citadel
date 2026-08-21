import { CardPreview } from "@agot/card-preview";
import {
    Accordion,
    AccordionItem,
    Alert,
    Card,
    Checkbox,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Skeleton
} from "@heroui/react";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages, ValidationSummary } from "../../../components/wizard";
import { PlaytestingUpdate } from "common/models/schemas";
import { DeepPartial } from "common/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import RichTextArea from "../../../components/richTextArea";
import { useCreatePlaytestingUpdateMutation, useGetCardsQuery, useGetPreviousCardQuery } from "../../../api";
import { renderPlaytestingCard, SemanticVersion, thronesColors } from "common/utils";
import { IPlaytestCard } from "common/models/cards";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { noteTypeIcon } from "../../../utils";
import RichText from "../../../components/richText";
import { sortBy } from "lodash-es";
import GithubCardStatus from "../../../components/status/githubCardStatus";
import { changeTypeClasses } from "../../../constants";
import CardStack from "../../../components/cardStack";
import LoadingCard from "../../../components/loadingCard";

export default function CreatePlaytestingUpdateModal({
    isOpen,
    project,
    onClose: onModalClose = () => true,
    onSave = () => true
}: CreatePlaytestingUpdateModalProps) {
    const { data: draftsData, isLoading: isDraftsLoading } = useGetCardsQuery({
        filter: { project: project?.number, draft: true }
    });
    const [createPlaytestingUpdate, { isLoading }] = useCreatePlaytestingUpdateMutation();
    const [playtestingUpdate, setPlaytestingUpdate] = useState<DeepPartial<IPlaytestingUpdate>>({
        project: project.number
    });

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

    const toggleCard = useCallback(
        (card: IPlaytestCard) => {
            const selected = selectedCards.find(
                (selected) => selected.number === card.number && selected.version === card.version
            );

            if (selected) {
                setSelectedCards((prev) => prev.filter((p) => p !== selected));
            } else {
                setSelectedCards((prev) => [...prev, card]);
            }
        },
        [selectedCards]
    );

    const onSubmit = useCallback(
        async (playtestingUpdate: IPlaytestingUpdate) => {
            setPlaytestingUpdate(playtestingUpdate);
            const { playtestingUpdate: newPlaytestingUpdate } =
                await createPlaytestingUpdate(playtestingUpdate).unwrap();
            onSave(newPlaytestingUpdate);
            onModalClose();
        },
        [createPlaytestingUpdate, onModalClose, onSave]
    );

    const draftCardSelectors = useMemo(() => {
        if (isDraftsLoading) {
            return <Skeleton className="w-full h-44 rounded-xl" />;
        }

        if (!draftsData?.items) {
            return null;
        }

        return sortBy(draftsData?.items, ["faction", "type"]).map((card) => {
            const isSelected = selectedCards.some(
                (selected) => selected.number === card.number && selected.version === card.version
            );
            return (
                <SelectableDraftCard
                    key={`${card.project}|${card.number}|${card.version}`}
                    card={card}
                    isSelected={isSelected}
                    onToggle={toggleCard}
                />
            );
        });
    }, [draftsData?.items, isDraftsLoading, selectedCards, toggleCard]);

    return (
        <Modal
            isOpen={isOpen}
            placement="top-center"
            size="4xl"
            scrollBehavior="inside"
            onOpenChange={(isOpen) => !isOpen && onModalClose()}
        >
            <ModalContent>
                {(onClose) => (
                    <Wizard schema={PlaytestingUpdate.Draft} onSubmit={onSubmit} data={playtestingUpdate}>
                        <ModalHeader className="font-cinzel">{`Confirm PT Update - ${project.code} #${project.version + 1}`}</ModalHeader>
                        <ModalBody>
                            <ValidationSummary />
                            <div>
                                <WizardPages>
                                    <WizardPage className="flex flex-col p-2 gap-2 font-crimson">
                                        <div className="text-md font-cinzel">Select Drafted Cards</div>
                                        <div className="text-sm font-sans">
                                            Expand the card name to view the changed version.
                                        </div>
                                        <div className="text-xs font-sans">
                                            <FontAwesomeIcon icon={faInfoCircle} /> Any cards which are not implemented
                                            will need to be manually playtested online until they are implemented.
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
                                            {draftCardSelectors}
                                        </div>
                                    </WizardPage>
                                    <WizardPage className="space-y-2">
                                        <div className="text-md font-cinzel">Describe the update</div>
                                        <div className="text-sm font-sans">
                                            This is optional, but helps tell playtesters any broad details about this
                                            update.
                                        </div>
                                        <RichTextArea
                                            label="Description"
                                            name="description"
                                            value={playtestingUpdate.description}
                                            onValueChange={(description) =>
                                                setPlaytestingUpdate((prev) => ({ ...prev, description }))
                                            }
                                        />
                                        <Alert color="warning" className="text-sm" title="Confirming is immediate">
                                            These cards go live for playtesters and the update is announced on Discord
                                            straight away. Cards which aren't implemented yet can still be tested in
                                            person — the update page tracks what becomes playable online.
                                        </Alert>
                                    </WizardPage>
                                </WizardPages>
                            </div>
                        </ModalBody>
                        <ModalFooter>
                            <WizardBack onCancel={onClose} />
                            <WizardNext isLoading={isLoading} color="primary" />
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
}

type CreatePlaytestingUpdateModalProps = {
    isOpen: boolean;
    project: IProject;
    onClose?: () => void;
    onSave?: (project: IPlaytestingUpdate) => void;
};

function SelectableDraftCard({ card, isSelected, onToggle }: SelectableDraftCardProps) {
    const [showNew, setShowNew] = useState(true);
    const { data: previousCard } = useGetPreviousCardQuery({
        project: card.project,
        number: card.number,
        version: card.version
    });
    return (
        <Card
            className={classNames("w-full border-2", { "brightness-50": !isSelected })}
            style={{ borderColor: thronesColors[card.faction] }}
        >
            <div className="grow flex flex-col">
                <Accordion>
                    <AccordionItem
                        textValue={card.name}
                        classNames={{ trigger: "p-0" }}
                        title={
                            <div className="flex gap-2 items-center p-2">
                                <Checkbox
                                    className="p-0"
                                    isSelected={isSelected}
                                    onValueChange={() => onToggle(card)}
                                />
                                <div className="text-xl font-cinzel text-foreground truncate">
                                    {card.name} <span className="text-foreground/50 font-semibold">{card.version}</span>
                                </div>
                            </div>
                        }
                    >
                        <div className="w-full flex justify-center">
                            <CardStack
                                cards={[previousCard, card]}
                                selectedIndex={showNew ? 1 : 0}
                                className="w-2/3"
                                onClick={() => setShowNew((prev) => !prev)}
                                tilt={-2}
                            >
                                {(card) =>
                                    card ? (
                                        <CardPreview
                                            card={renderPlaytestingCard(card)}
                                            className="select-none"
                                            rounded
                                        />
                                    ) : (
                                        <LoadingCard />
                                    )
                                }
                            </CardStack>
                        </div>
                    </AccordionItem>
                </Accordion>
                <div className="flex-1">
                    {card.note ? (
                        <>
                            <div
                                className={classNames(
                                    "text-lg tracking-wider font-cinzel uppercase pl-4 pr-10 py-0.5 w-full",
                                    changeTypeClasses[card.note.type]
                                )}
                            >
                                <FontAwesomeIcon icon={noteTypeIcon[card.note.type]} /> {card.note.type}
                            </div>
                            <div className="text-sm tracking-wide text-foreground font-sans px-4 py-2">
                                <RichText html={card.note.text} />
                            </div>
                        </>
                    ) : (
                        <Alert color="danger" className="text-sm" title="No change note found!">
                            This should not be possible, and likely indicates something went wrong.
                        </Alert>
                    )}
                </div>
                <div>
                    <GithubCardStatus project={card.project} number={card.number} version={card.version} />
                </div>
            </div>
        </Card>
    );
}

type SelectableDraftCardProps = {
    card: IPlaytestCard;
    isSelected: boolean;
    onToggle: (card: IPlaytestCard) => void;
};
