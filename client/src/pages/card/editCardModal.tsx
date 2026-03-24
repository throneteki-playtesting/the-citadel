import { IPlaytestCard } from "common/models/cards";
import { BaseElementProps } from "../../types";
import { addToast, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { usePutDraftCardMutation } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeepPartial } from "common/types";
import CardEditor from "../../components/cardEditor";
import { getBaseCardValues, isPreview, renderPlaytestingCard } from "common/utils";
import { CardPreview } from "@agot/card-preview";
import { PlaytestingCard } from "common/models/schemas";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../components/wizard";
import NoteEditor from "./noteEditor";

const EditCardModal = ({ isOpen, card: initial, onClose: onModalClose = () => true, onSave = () => true }: EditCardModalProps) => {
    const [putDraft, { isLoading: isPuttingDraft }] = usePutDraftCardMutation();
    const [card, setCard] = useState<DeepPartial<IPlaytestCard>>({});

    useEffect(() => {
        const data: DeepPartial<IPlaytestCard> = !initial ? {} : initial;
        setCard(data);
    }, [initial]);

    const onSubmit = useCallback(async (validCard: IPlaytestCard) => {
        setCard(validCard);
        try {
            const newCard = await putDraft(validCard).unwrap();
            // Saves the version
            setCard(newCard);
            onSave(newCard);
            onModalClose();
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to save", color: "danger", description: "An unknown error has occurred" });
        }
    }, [onModalClose, onSave, putDraft]);

    const renderDraftCard = useMemo(() => {
        const render = renderPlaytestingCard(card);
        render.watermark = { ...render.watermark, middle: "Draft" };
        return render;
    }, [card]);

    return <Modal isOpen={isOpen} placement="top-center" onOpenChange={(isOpen) => !isOpen && onModalClose() } size="3xl">
        <ModalContent>
            {(onClose) => (
                <Wizard
                    schema={PlaytestingCard.Draft}
                    onSubmit={onSubmit}
                    data={card}
                >
                    <ModalHeader>Draft Card Editor</ModalHeader>
                    <ModalBody>
                        <div className="flex flex-col md:flex-row gap-2">
                            <CardPreview card={renderDraftCard} className="self-center md:self-start shrink-0 max-w-64"/>
                            <WizardPages>
                                <WizardPage data={getBaseCardValues(card)}>
                                    <CardEditor card={card} onUpdate={setCard} inputOptions={{ faction: "disabled", designer: "hidden" }}/>
                                </WizardPage>
                                {!isPreview(card) &&
                                    <WizardPage data={{ note: card.note ?? {} }}>
                                        <NoteEditor note={card.note} onChange={(note) => setCard((prev) => ({ ...prev, note }))}/>
                                    </WizardPage>
                                }
                            </WizardPages>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <WizardBack onCancel={onClose}/>
                        <WizardNext isLoading={isPuttingDraft} color={"primary"}/>
                    </ModalFooter>
                </Wizard>
            )}
        </ModalContent>
    </Modal>;
};

type EditCardModalProps = Omit<BaseElementProps, "children"> & { isOpen: boolean, card?: DeepPartial<IPlaytestCard>, onClose?: () => void, onSave?: (card: IPlaytestCard) => void }

export default EditCardModal;