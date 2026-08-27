import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFloppyDisk, faPencil, faRotateLeft, faXmark } from "@fortawesome/free-solid-svg-icons";
import { ISlotRef } from "common/models/slots";
import { useUpdateSlotFaqMutation } from "../../../api";
import { showApiErrorToast } from "../../../api/errors";
import RichText from "../../../components/richText";
import RichTextArea from "../../../components/richTextArea";
import SectionTitle from "../../../components/sectionTitle";

/**
 * The team's own record of what was decided about a card, so a settled question is not relitigated the
 * next time somebody reads it. Internal only - nothing exports this anywhere.
 */
export default function FaqSection({ project, number, faq, canEdit }: FaqSectionProps) {
    const [updateSlotFaq, { isLoading: isSaving }] = useUpdateSlotFaqMutation();
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState<string>();

    // Reset whenever the stored notes change, so a save made elsewhere is not silently overwritten
    useEffect(() => {
        setDraft(faq);
        setIsEditing(false);
    }, [faq]);

    // Blank and absent are the same nothing here, so opening an empty editor and saving it straight back
    // is not a change worth offering
    const isDirty = (draft ?? "") !== (faq ?? "");

    const onSave = async () => {
        try {
            await updateSlotFaq({ project, number, faq: draft ?? "" }).unwrap();
            setIsEditing(false);
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to update FAQ notes" });
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <SectionTitle className="flex-1">FAQ</SectionTitle>
                {canEdit && (
                    <Button
                        size="sm"
                        variant="flat"
                        isDisabled={isSaving}
                        startContent={<FontAwesomeIcon icon={isEditing ? faXmark : faPencil} />}
                        onPress={() => {
                            setDraft(faq);
                            setIsEditing(!isEditing);
                        }}
                    >
                        {isEditing ? "Close" : faq ? "Edit" : "Add notes"}
                    </Button>
                )}
            </div>

            <span className="text-xs text-foreground/50">
                Work-in-progress notes for the official FAQ, mostly used as reference & reminder for later.
            </span>

            {isEditing ? (
                <div className="flex flex-col gap-2">
                    <RichTextArea
                        features={["lists", "quote"]}
                        value={draft}
                        onValueChange={setDraft}
                        isDisabled={isSaving}
                        minRows={5}
                        placeholder="Rulings and decisions worth keeping for this card..."
                    />
                    <div className="flex justify-end gap-1.5">
                        <Button
                            size="sm"
                            variant="flat"
                            isDisabled={isSaving || !isDirty}
                            startContent={<FontAwesomeIcon icon={faRotateLeft} />}
                            onPress={() => setDraft(faq)}
                        >
                            Discard
                        </Button>
                        <Button
                            size="sm"
                            color="primary"
                            isLoading={isSaving}
                            isDisabled={!isDirty}
                            startContent={!isSaving && <FontAwesomeIcon icon={faFloppyDisk} />}
                            onPress={onSave}
                        >
                            Save notes
                        </Button>
                    </div>
                </div>
            ) : faq ? (
                <div className="text-sm text-foreground/80">
                    <RichText html={faq} />
                </div>
            ) : (
                <span className="text-sm text-foreground/50">Nothing recorded for this card yet.</span>
            )}
        </div>
    );
}

type FaqSectionProps = ISlotRef & {
    faq?: string;
    canEdit: boolean;
};
