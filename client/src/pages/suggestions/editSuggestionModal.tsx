import { ICardSuggestion } from "common/models/cards";
import { BaseElementProps } from "../../types";
import { addToast, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { useCreateSuggestionMutation, useUpdateSuggestionMutation } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeepPartial } from "common/types";
import CardEditor from "../../components/cardEditor";
import { renderCardSuggestion } from "common/utils";
import { CardPreview } from "@agot/card-preview";
import { Wizard, WizardBack, WizardNext, WizardPage, WizardPages } from "../../components/wizard";
import { CardSuggestion } from "common/models/schemas";
import ComboBox from "../../components/combobox";
import { RootState } from "../../api/store";
import { useSelector } from "react-redux";

const EditSuggestionModal = ({ isOpen, suggestion: initial, onClose: onModalClose = () => true, onSave = () => true }: EditSuggestionModalProps) => {
    const user = useSelector((state: RootState) => state.auth.user);
    const [createSuggestion, { isLoading: isCreating }] = useCreateSuggestionMutation();
    const [updateSuggestion, { isLoading: isUpdating }] = useUpdateSuggestionMutation();
    const [suggestion, setSuggestion] = useState<DeepPartial<ICardSuggestion>>({});

    const isNew = useMemo(() => !suggestion?.id, [suggestion?.id]);

    useEffect(() => {
        setSuggestion({ ...initial, ...(isNew && user && { user: { discordId: user.discordId, displayname: user.displayname } }) });
    }, [initial, isNew, user]);

    const onSubmit = useCallback(async (validSuggestion: ICardSuggestion) => {
        setSuggestion(validSuggestion);

        try {
            const newSuggestion = isNew ? await createSuggestion(validSuggestion).unwrap() : await updateSuggestion(validSuggestion).unwrap();
            setSuggestion(newSuggestion);
            onSave(newSuggestion);
            onModalClose();
        } catch (err) {
            // TODO: Better error handling from redux (eg. use ApiError.message for description)
            addToast({ title: "Failed to save", color: "danger", description: "An unknown error has occurred" });
        }
    }, [isNew, createSuggestion, updateSuggestion, onSave, onModalClose]);

    return <Modal isOpen={isOpen} placement="top-center" onOpenChange={(isOpen) => !isOpen && onModalClose() } size="3xl">
        <ModalContent>
            {(onClose) => (
                <Wizard
                    schema={CardSuggestion.Draft}
                    onSubmit={onSubmit}
                    data={suggestion}
                >
                    <ModalHeader>Card Suggestion Editor</ModalHeader>
                    <ModalBody>
                        <div className="flex flex-col md:flex-row gap-2">
                            <CardPreview card={renderCardSuggestion(suggestion)} className="self-center md:self-start shrink-0 max-w-64"/>
                            <WizardPages>
                                <WizardPage data={{ card: suggestion.card }}>
                                    <CardEditor className="w-full" card={suggestion.card} onUpdate={(card) => setSuggestion((prev) => ({ ...prev, card }))} inputOptions={{ designer: "hidden" }}/>
                                </WizardPage>
                                <WizardPage data={{ tags: suggestion.tags }}>
                                    <ComboBox label="Tags" values={suggestion.tags ?? []} onChange={(tags) => setSuggestion((prev) => ({ ...prev, tags }))} chip={{ color: "primary", size: "sm" }}/>
                                </WizardPage>
                            </WizardPages>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <ModalFooter>
                            <WizardBack onCancel={onClose}/>
                            <WizardNext isLoading={isCreating || isUpdating} color={"primary"}/>
                        </ModalFooter>
                    </ModalFooter>
                </Wizard>
            )}
        </ModalContent>
    </Modal>;
};

type EditSuggestionModalProps = Omit<BaseElementProps, "children"> & { isOpen: boolean, suggestion?: DeepPartial<ICardSuggestion>, onClose?: () => void, onSave?: (suggestion: ICardSuggestion) => void }

export default EditSuggestionModal;