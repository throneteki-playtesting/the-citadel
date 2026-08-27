import { useEffect, useState } from "react";
import { Button, Form, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { IRefinementInquiry, isInquiryAddressed } from "common/models/refinement";
import { Slot } from "common/models/schemas";
import { useResolveInquiryMutation } from "../../../api";
import { useAuth } from "../../../hooks/useAuth";
import { useFormValidation } from "../../../hooks/useFormValidation";
import { showApiErrorToast } from "../../../api/errors";
import FormValidationSummary from "../../../components/formValidationSummary";
import RichTextArea from "../../../components/richTextArea";

const RESOLVE_FORM_ID = "resolve-inquiry-form";

/**
 * Resolving an inquiry. Anyone on the team may resolve anything, which is why a reason is asked for - it
 * is the only record of why. The exception is one a card update has already answered, where that note is the record.
 */
export default function ResolveInquiryModal({ isOpen, project, number, inquiry, onClose }: ResolveModalProps) {
    const { user } = useAuth();
    const [resolveInquiry, { isLoading: isSaving }] = useResolveInquiryMutation();
    const [note, setNote] = useState<string>();

    const isAddressed = !!inquiry && isInquiryAddressed(inquiry);
    const { errors, validate, isValidationError, clearErrors } = useFormValidation(Slot.InquiryResolution(isAddressed));

    useEffect(() => {
        if (isOpen) {
            setNote(undefined);
            clearErrors();
        }
    }, [isOpen, clearErrors]);

    const isSomeoneElses = !!inquiry && inquiry.createdBy !== user?.discordId;

    const onSave = async () => {
        if (!inquiry || !validate({ status: "resolved", note })) {
            return;
        }

        try {
            await resolveInquiry({ project, number, inquiry: inquiry.inquiry, note }).unwrap();
            onClose();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err, { title: "Failed to resolve inquiry" });
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg">
            <ModalContent>
                <ModalHeader>Resolve inquiry #{inquiry?.inquiry}</ModalHeader>
                <ModalBody>
                    <Form
                        id={RESOLVE_FORM_ID}
                        className="flex flex-col items-stretch gap-3"
                        validationErrors={errors}
                        onSubmit={(e) => {
                            if ((e.target as HTMLElement).id !== RESOLVE_FORM_ID) {
                                return;
                            }
                            e.preventDefault();
                            void onSave();
                        }}
                    >
                        <p className="text-sm text-foreground/70">
                            {isAddressed
                                ? `Version ${inquiry?.addressedIn} already answers for this, so a reason is optional - add one only if there is more to say.`
                                : "No card update has answered this, so say how it was settled - whether the card changed or it was decided to leave as it is."}
                            {!isAddressed &&
                                isSomeoneElses &&
                                " You did not raise this one, so your note is the only account of it."}
                        </p>
                        <RichTextArea
                            name="note"
                            label="Reason"
                            isRequired={!isAddressed}
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
                    <Button color="primary" type="submit" form={RESOLVE_FORM_ID} isLoading={isSaving}>
                        Resolve
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type ResolveModalProps = {
    isOpen: boolean;
    project: number;
    number: number;
    inquiry?: IRefinementInquiry;
    onClose: () => void;
};
