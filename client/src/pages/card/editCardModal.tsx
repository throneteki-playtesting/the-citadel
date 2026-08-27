import { IPlaytestCard } from "common/models/cards";
import { BaseElementProps } from "../../types";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { usePutDraftCardMutation } from "../../api";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { DeepPartial } from "common/types";
import CardEditor from "../../components/cardEditor";
import { getBaseCardValues, isPreview, renderPlaytestingCard } from "common/utils";
import { CardPreview } from "@agot/card-preview";
import { PlaytestingCard } from "common/models/schemas";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages, ValidationSummary } from "../../components/wizard";
import NoteEditor from "./noteEditor";
import AddressedInquiries from "./refinement/addressedInquiries";
import { useIsReleaseBound } from "../../hooks/useIsReleaseBound";
import StatusNotice from "../../components/statusNotice";
import { faFlagCheckered } from "@fortawesome/free-solid-svg-icons";

export default function EditCardModal({
    title = "Card Editor",
    isOpen,
    card: initial,
    onClose: onModalClose = () => true,
    onSave = () => true
}: EditCardModalProps) {
    const [putDraft, { isLoading: isPuttingDraft }] = usePutDraftCardMutation();
    const [card, setCard] = useState<DeepPartial<IPlaytestCard>>({});
    // Kept apart from the card - it says something about the card's inquiries, not about the card
    const [addressedInquiries, setAddressedInquiries] = useState<number[]>([]);

    useEffect(() => {
        const data: DeepPartial<IPlaytestCard> = !initial ? {} : initial;
        setCard(data);
        setAddressedInquiries([]);
    }, [initial]);

    const isDraftReleaseBound = useIsReleaseBound(card.project, card.number);

    // Release-bound drafts are almost always a refinement - preselected once there's nothing chosen yet,
    // but only a starting point: picking any type here (including refinement itself) stops this from firing again
    useEffect(() => {
        if (isDraftReleaseBound && !card.note?.type) {
            setCard((prev) => ({ ...prev, note: { ...prev.note, type: "refinement" } }));
        }
    }, [isDraftReleaseBound, card.note?.type]);

    const onSubmit = useCallback(
        async (validCard: IPlaytestCard) => {
            setCard(validCard);
            const newCard = await putDraft({ ...validCard, addressedInquiries }).unwrap();
            setCard(newCard);
            onSave(newCard);
            onModalClose();
        },
        [addressedInquiries, onModalClose, onSave, putDraft]
    );

    const renderDraftCard = useMemo(() => {
        const render = renderPlaytestingCard(card);
        render.watermark = { ...render.watermark, middle: "Draft" };
        return render;
    }, [card]);

    return (
        <Modal isOpen={isOpen} placement="top-center" onOpenChange={(isOpen) => !isOpen && onModalClose()} size="3xl">
            <ModalContent>
                {(onClose) => (
                    <Wizard schema={PlaytestingCard.Draft} onSubmit={onSubmit} data={card}>
                        <ModalHeader>{title}</ModalHeader>
                        <ModalBody>
                            <ValidationSummary />
                            {isDraftReleaseBound && (
                                <StatusNotice
                                    icon={faFlagCheckered}
                                    color="warning"
                                    label="Marked for release"
                                    detail="This card is locked to its printed form — this draft won't trigger a playtesting update."
                                />
                            )}
                            <div className="flex flex-col md:flex-row gap-2 min-w-0">
                                <CardPreview
                                    card={renderDraftCard}
                                    className="self-center md:self-start shrink-0 max-w-64"
                                />
                                <WizardPages className="flex-1 min-w-0">
                                    <WizardPage controlledData={getBaseCardValues(card)}>
                                        <CardEditor
                                            card={card}
                                            onUpdate={setCard}
                                            inputOptions={{ faction: "disabled" }}
                                        />
                                    </WizardPage>
                                    {!isPreview(card) && (
                                        <WizardPage controlledData={{ note: card.note ?? {} }}>
                                            <NoteEditor
                                                note={card.note}
                                                isReleaseBound={isDraftReleaseBound}
                                                onChange={(note) => setCard((prev) => ({ ...prev, note }))}
                                            />
                                            <AddressedInquiries
                                                project={card.project}
                                                number={card.number}
                                                version={card.draft ? card.version : undefined}
                                                value={addressedInquiries}
                                                onChange={setAddressedInquiries}
                                            />
                                        </WizardPage>
                                    )}
                                </WizardPages>
                            </div>
                        </ModalBody>
                        <ModalFooter>
                            <WizardBack onCancel={onClose} />
                            <WizardNext isLoading={isPuttingDraft} color="primary" />
                        </ModalFooter>
                    </Wizard>
                )}
            </ModalContent>
        </Modal>
    );
}

type EditCardModalProps = Omit<BaseElementProps, "children"> & {
    title?: ReactNode;
    isOpen: boolean;
    card?: DeepPartial<IPlaytestCard>;
    onClose?: () => void;
    onSave?: (card: IPlaytestCard) => void;
};
