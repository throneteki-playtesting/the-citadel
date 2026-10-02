import { useState } from "react";
import { addToast, Button, Form, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { pick } from "lodash-es";
import { ISlot, ISlotOptions, slotOptionKeys } from "common/models/slots";
import { Slot } from "common/models/schemas";
import { factionNames } from "common/utils";
import { useUpdateSlotOptionsMutation } from "../../api";
import { showApiErrorToast } from "../../api/errors";
import { useFormValidation } from "../../hooks/useFormValidation";
import FormValidationSummary from "../formValidationSummary";
import ThronesIcon from "../thronesIcon";
import SlotOptionsEditor from "./slotOptionsEditor";
import { conditionLabels } from "common/models/slotConditions";

const FORM_ID = "slot-options-form";

export default function SlotOptionsModal({ isOpen, slot, onClose }: SlotOptionsModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg" placement="center" scrollBehavior="inside">
            <ModalContent>{slot && <SlotOptionsForm slot={slot} onClose={onClose} />}</ModalContent>
        </Modal>
    );
}

// Mounted only while open, so every opening starts from the slot as saved
function SlotOptionsForm({ slot, onClose }: { slot: ISlot; onClose: () => void }) {
    const [draft, setDraft] = useState<ISlotOptions>(() => pick(slot, slotOptionKeys));
    const { errors, validate, isValidationError, clearErrors } = useFormValidation(Slot.Options);
    const [updateOptions, { isLoading }] = useUpdateSlotOptionsMutation();

    // Errors are addressed by condition index, so adding or removing one renames every error after it
    const onChange = (next: ISlotOptions) => {
        if ((next.conditions?.length ?? 0) !== (draft.conditions?.length ?? 0)) {
            clearErrors();
        }
        setDraft(next);
    };

    const onSave = async () => {
        if (!validate(draft)) {
            return;
        }
        try {
            await updateOptions({ project: slot.project, number: slot.number, ...draft }).unwrap();
            addToast({ title: "Slot options saved", color: "success", description: `Slot #${slot.number} updated` });
            onClose();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err, { title: "Failed to save slot options" });
            }
        }
    };

    return (
        <>
            <ModalHeader className="flex items-center gap-2">
                <ThronesIcon name={slot.faction} />
                <span>
                    #{slot.number} {factionNames[slot.faction]} slot
                </span>
            </ModalHeader>
            <ModalBody>
                <span className="text-sm text-foreground/60">
                    What this slot is looking for. A card that strays from its conditions is flagged, never refused.
                </span>
                <Form
                    id={FORM_ID}
                    validationErrors={errors}
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (e.target === e.currentTarget) {
                            void onSave();
                        }
                    }}
                >
                    <div className="w-full">
                        <SlotOptionsEditor value={draft} faction={slot.faction} onChange={onChange} />
                    </div>
                </Form>
                <FormValidationSummary
                    errors={errors}
                    mappedPaths={Object.keys(errors).filter((path) => path !== "conditions")}
                    labelFor={(path) => {
                        const condition = draft.conditions?.[Number(path.split(".")[1])];
                        return condition && conditionLabels[condition.stat];
                    }}
                />
            </ModalBody>
            <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                    Cancel
                </Button>
                <Button color="primary" type="submit" form={FORM_ID} isLoading={isLoading}>
                    Save
                </Button>
            </ModalFooter>
        </>
    );
}

type SlotOptionsModalProps = {
    isOpen: boolean;
    slot?: ISlot;
    onClose: () => void;
};
