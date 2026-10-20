import { ReactNode, useEffect, useState } from "react";
import { Button, Form, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import Joi from "joi";
import { IRefinementInquiry } from "common/models/refinement";
import Modal from "../../../components/modal";
import { useFormValidation } from "../../../hooks/useFormValidation";
import { showApiErrorToast } from "../../../api/errors";
import FormValidationSummary from "../../../components/formValidationSummary";
import RichTextArea from "../../../components/richTextArea";

// A decision about an inquiry which asks for a reason - resolving it, or deciding nothing changes
export default function InquiryNoteModal({
    isOpen,
    inquiry,
    formId,
    title,
    prompt,
    schema,
    body,
    isRequired,
    isSaving,
    submitLabel,
    failureTitle,
    onSubmit,
    onClose
}: InquiryNoteModalProps) {
    const [note, setNote] = useState<string>();
    const { errors, validate, isValidationError, clearErrors } = useFormValidation(schema);

    useEffect(() => {
        if (isOpen) {
            setNote(undefined);
            clearErrors();
        }
    }, [isOpen, clearErrors]);

    const onSave = async () => {
        if (!inquiry || !validate(body(note))) {
            return;
        }

        try {
            await onSubmit(inquiry, note);
            onClose();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err, { title: failureTitle });
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg">
            <ModalContent>
                <ModalHeader>
                    {title} #{inquiry?.inquiry}
                </ModalHeader>
                <ModalBody>
                    <Form
                        id={formId}
                        className="flex flex-col items-stretch gap-3"
                        validationErrors={errors}
                        onSubmit={(e) => {
                            if ((e.target as HTMLElement).id !== formId) {
                                return;
                            }
                            e.preventDefault();
                            void onSave();
                        }}
                    >
                        <p className="text-sm text-foreground/70">{prompt}</p>
                        <RichTextArea
                            name="note"
                            label="Reason"
                            isRequired={isRequired}
                            value={note}
                            onValueChange={setNote}
                            isDisabled={isSaving}
                            minRows={4}
                        />
                        <FormValidationSummary errors={errors} mappedPaths={["note"]} />
                    </Form>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} isDisabled={isSaving}>
                        Cancel
                    </Button>
                    <Button color="primary" type="submit" form={formId} isLoading={isSaving}>
                        {submitLabel}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type InquiryNoteModalProps = {
    isOpen: boolean;
    inquiry?: IRefinementInquiry;
    /** The form answers only its own submit, so each use needs an id of its own */
    formId: string;
    title: string;
    prompt: ReactNode;
    schema: Joi.Schema;
    /** What `schema` validates, built from the note */
    body: (note?: string) => object;
    isRequired: boolean;
    isSaving: boolean;
    submitLabel: string;
    failureTitle: string;
    onSubmit: (inquiry: IRefinementInquiry, note?: string) => Promise<unknown>;
    onClose: () => void;
};
