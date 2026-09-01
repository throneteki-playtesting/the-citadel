import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { InquirySeverity, IRefinementInquiry, INQUIRY_SUMMARY_MAX } from "common/models/refinement";
import { Slot } from "common/models/schemas";
import { IPlaytestCard } from "common/models/cards";
import { SemanticVersion } from "common/utils";
import { useCreateInquiryMutation, useUpdateInquiryMutation } from "../../../api";
import { useFormValidation } from "../../../hooks/useFormValidation";
import { showApiErrorToast } from "../../../api/errors";
import FormValidationSummary from "../../../components/formValidationSummary";
import RichTextArea from "../../../components/richTextArea";
import SeveritySelect from "../../../components/refinement/severitySelect";
import { StackedVersion } from "../cardDetail";

const INQUIRY_FORM_ID = "inquiry-form";

/**
 * Raise or edit an inquiry. The card sits alongside the fields rather than being left behind on the page:
 * an inquiry is almost always about exact wording, and writing about wording you cannot see is guesswork.
 */
export default function InquiryModal({ isOpen, project, number, inquiry, card, version, onClose }: InquiryModalProps) {
    const [createInquiry, { isLoading: isCreating }] = useCreateInquiryMutation();
    const [updateInquiry, { isLoading: isUpdating }] = useUpdateInquiryMutation();
    const [severity, setSeverity] = useState<InquirySeverity>();
    const [summary, setSummary] = useState("");
    const [detail, setDetail] = useState<string>();
    const { errors, validate, isValidationError, clearErrors } = useFormValidation(Slot.Inquiry);

    useEffect(() => {
        if (isOpen) {
            setSeverity(inquiry?.severity);
            setSummary(inquiry?.summary ?? "");
            setDetail(inquiry?.detail);
            clearErrors();
        }
    }, [isOpen, inquiry, clearErrors]);

    const isSaving = isCreating || isUpdating;

    const onSave = async () => {
        const body = { severity: severity as InquirySeverity, summary, detail };
        if (!validate(body)) {
            return;
        }

        try {
            if (inquiry) {
                await updateInquiry({ project, number, inquiry: inquiry.inquiry, ...body }).unwrap();
            } else {
                await createInquiry({ project, number, ...body }).unwrap();
            }
            onClose();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err, { title: `Failed to ${inquiry ? "update" : "raise"} inquiry` });
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
            <ModalContent>
                <ModalHeader>{inquiry ? `Edit inquiry #${inquiry.inquiry}` : "Raise an inquiry"}</ModalHeader>
                <ModalBody>
                    <div className="flex flex-col-reverse gap-4 md:flex-row">
                        <Form
                            id={INQUIRY_FORM_ID}
                            className="flex flex-1 flex-col items-stretch gap-3"
                            validationErrors={errors}
                            onSubmit={(e) => {
                                if ((e.target as HTMLElement).id !== INQUIRY_FORM_ID) {
                                    return;
                                }
                                e.preventDefault();
                                void onSave();
                            }}
                        >
                            <SeveritySelect
                                name="severity"
                                value={severity}
                                onChange={setSeverity}
                                isDisabled={isSaving}
                            />
                            <Input
                                name="summary"
                                label="Summary"
                                isRequired
                                maxLength={INQUIRY_SUMMARY_MAX}
                                value={summary}
                                onValueChange={setSummary}
                                isDisabled={isSaving}
                                endContent={
                                    <span className="text-xs text-default-400">
                                        {summary.length}/{INQUIRY_SUMMARY_MAX}
                                    </span>
                                }
                            />
                            <RichTextArea
                                name="detail"
                                label="Detail"
                                value={detail}
                                onValueChange={setDetail}
                                isDisabled={isSaving}
                                minRows={5}
                                placeholder="What is the problem, decision or thing to look into?"
                            />
                            <FormValidationSummary errors={errors} mappedPaths={["severity", "summary", "detail"]} />
                            {version && (
                                <p className="text-xs text-foreground/50">
                                    Saving takes this as relevant to{" "}
                                    <span className="tabular-nums text-foreground/70">{version}</span>, the card as it
                                    stands now.
                                </p>
                            )}
                        </Form>
                        {card && (
                            <div className="mx-auto w-56 shrink-0 self-start md:mx-0">
                                <StackedVersion card={card} isSelected />
                            </div>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} isDisabled={isSaving}>
                        Cancel
                    </Button>
                    <Button color="primary" type="submit" form={INQUIRY_FORM_ID} isLoading={isSaving}>
                        {inquiry ? "Save changes" : "Raise inquiry"}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type InquiryModalProps = {
    isOpen: boolean;
    project: number;
    number: number;
    /** Absent when raising a new one */
    inquiry?: IRefinementInquiry;
    /** The card refinement measures against - the one this inquiry will be stamped with on save */
    card?: IPlaytestCard;
    version?: SemanticVersion;
    onClose: () => void;
};
