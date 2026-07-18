import { Faction, ICardSuggestion, IPlaytestCard } from "common/models/cards";
import { DeepPartial } from "common/types";
import { BaseElementProps } from "../../../types";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages, ValidationSummary } from "../../../components/wizard";
import { PlaytestingCard } from "common/models/schemas";
import { CardPreview } from "@agot/card-preview";
import { renderCardSuggestion, renderPlaytestingCard, suggestionToPlaytestCard } from "common/utils";
import SuggestionsGrid from "../../suggestions/suggestionsGrid";
import classNames from "classnames";
import CardEditor from "../../../components/cardEditor";
import { usePutDraftCardMutation } from "../../../api";
import ThronesIcon from "../../../components/thronesIcon";

const SelectSuggestionModal = ({ isOpen, project, number, faction, unselectable = [], onClose: onModalClose = () => true, onSave = () => true }: SelectSuggestionModalProps) => {
    const [putDraft, { isLoading: isPuttingDraft }] = usePutDraftCardMutation();
    const [selected, setSelected] = useState<ICardSuggestion>();
    const [card, setCard] = useState<DeepPartial<IPlaytestCard>>();

    useEffect(() => {
        setSelected(undefined);
    }, [number]);

    const onSubmit = useCallback(async (validCard: IPlaytestCard) => {
        setCard(validCard);
        const newCard = await putDraft(validCard).unwrap();
        setCard(newCard);
        onSave(newCard);
        onModalClose();
    }, [onModalClose, onSave, putDraft]);

    return (
        <Modal isOpen={isOpen} placement="top-center" onOpenChange={(isOpen) => !isOpen && onModalClose() } size="3xl">
            <ModalContent>
                {(onClose) => (
                    <Wizard
                        schema={PlaytestingCard.Draft}
                        onSubmit={onSubmit}
                    >
                        <ModalHeader><div className="space-x-1">{faction && <ThronesIcon name={faction}/>}<span>#{number} Select Suggestion</span></div></ModalHeader>
                        <ModalBody>
                            <ValidationSummary />
                            <WizardPages>
                                <WizardPage>
                                    <SuggestionsGrid filter={{ faction: faction ? [faction] : undefined }} hideFilters={{ faction: true }}>
                                        {(suggestion) => (
                                            <CardPreview
                                                key={suggestion.id}
                                                card={renderCardSuggestion(suggestion)}
                                                orientation="vertical"
                                                rounded={true}
                                                className={classNames("cursor-pointer select-none", { "ring-4 ring-primary-500": selected === suggestion }, { "opacity-50 grayscale pointer-events-none": unselectable.includes(suggestion.id!) })}
                                                onClick={() => {
                                                    const newSelected = selected === suggestion ? undefined : suggestion;
                                                    setSelected(newSelected);
                                                    const newCard = !newSelected ? undefined : suggestionToPlaytestCard(newSelected, project, number);
                                                    setCard(newCard);
                                                }}
                                            />
                                        )}
                                    </SuggestionsGrid>
                                </WizardPage>
                                <WizardPage controlledData={card}>
                                    <div className="flex flex-col md:flex-row gap-2">
                                        <CardPreview card={renderPlaytestingCard(card ?? {})} className="self-center md:self-start shrink-0 max-w-64"/>
                                        <CardEditor card={card} onUpdate={setCard} inputOptions={{ faction: "disabled" }}/>
                                    </div>
                                </WizardPage>
                            </WizardPages>
                        </ModalBody>
                        <ModalFooter>
                            <WizardBack onCancel={onClose}/>
                            <WizardNext isDisabled={!selected} isLoading={isPuttingDraft} color="primary"/>
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
};

type SelectSuggestionModalProps = Omit<BaseElementProps, "children"> & { isOpen: boolean, project: number, number: number, faction?: Faction, unselectable?: string[], onClose?: () => void, onSave?: (suggestion: IPlaytestCard) => void };
export default SelectSuggestionModal;