import { inquiryDecision, IRefinementInquiry } from "common/models/refinement";
import { Slot } from "common/models/schemas";
import { useResolveInquiryMutation } from "../../../api";
import { useAuth } from "../../../hooks/useAuth";
import InquiryNoteModal from "./inquiryNoteModal";

const RESOLVE_FORM_ID = "resolve-inquiry-form";

/**
 * Resolving an inquiry. Anyone may resolve anything, so a reason is asked for as the only record of why -
 * unless it is already decided, where the update's note or the no-change note is that record.
 */
export default function ResolveInquiryModal({ isOpen, project, number, inquiry, onClose }: ResolveModalProps) {
    const { user } = useAuth();
    const [resolveInquiry, { isLoading: isSaving }] = useResolveInquiryMutation();
    const decision = inquiry && inquiryDecision(inquiry);
    const isSomeoneElses = !!inquiry && inquiry.createdBy !== user?.discordId;

    return (
        <InquiryNoteModal
            isOpen={isOpen}
            inquiry={inquiry}
            formId={RESOLVE_FORM_ID}
            title="Resolve inquiry"
            prompt={
                <>
                    {decision === "addressed" &&
                        `Version ${inquiry?.addressedIn} already answers for this, so a reason is optional - add one only if there is more to say.`}
                    {decision === "noChange" &&
                        "It has already been decided that the card stays as it is, and why, so a reason is optional - add one only if there is more to say."}
                    {!decision &&
                        "Nothing has been decided for this yet, so say how it was settled - whether the card changed or it was decided to leave as it is."}
                    {!decision &&
                        isSomeoneElses &&
                        " You did not raise this one, so your note is the only account of it."}
                </>
            }
            schema={Slot.InquiryResolution(!!decision)}
            body={(note) => ({ status: "resolved", note })}
            isRequired={!decision}
            isSaving={isSaving}
            submitLabel="Resolve"
            failureTitle="Failed to resolve inquiry"
            onSubmit={(target, note) => resolveInquiry({ project, number, inquiry: target.inquiry, note }).unwrap()}
            onClose={onClose}
        />
    );
}

type ResolveModalProps = {
    isOpen: boolean;
    project: number;
    number: number;
    inquiry?: IRefinementInquiry;
    onClose: () => void;
};
