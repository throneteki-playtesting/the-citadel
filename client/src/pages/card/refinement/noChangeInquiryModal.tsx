import { IRefinementInquiry } from "common/models/refinement";
import { Slot } from "common/models/schemas";
import { useMarkInquiryNoChangeMutation } from "../../../api";
import InquiryNoteModal from "./inquiryNoteModal";

const NO_CHANGE_FORM_ID = "no-change-inquiry-form";

// Deciding the card stays as it is for an inquiry - it stays open, and the note is the record of why
export default function NoChangeInquiryModal({ isOpen, project, number, inquiry, onClose }: NoChangeModalProps) {
    const [markNoChange, { isLoading: isSaving }] = useMarkInquiryNoChangeMutation();

    return (
        <InquiryNoteModal
            isOpen={isOpen}
            inquiry={inquiry}
            formId={NO_CHANGE_FORM_ID}
            title="No change for inquiry"
            prompt="Say why the card stays as it is. The inquiry stays open until somebody resolves it."
            schema={Slot.InquiryNoChange}
            body={(note) => ({ note })}
            isRequired
            isSaving={isSaving}
            submitLabel="No change"
            failureTitle="Failed to mark inquiry as no change"
            onSubmit={(target, note) =>
                markNoChange({ project, number, inquiry: target.inquiry, note: note ?? "" }).unwrap()
            }
            onClose={onClose}
        />
    );
}

type NoChangeModalProps = {
    isOpen: boolean;
    project: number;
    number: number;
    inquiry?: IRefinementInquiry;
    onClose: () => void;
};
