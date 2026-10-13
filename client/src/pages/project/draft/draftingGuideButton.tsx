import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import { useTabGuideModal } from "../../../hooks/useTabGuideModal";
import DraftingGuideModal from "./draftingGuideModal";
import GuideBubble from "../../../components/guideBubble";

const DRAFTING_GUIDE_SEEN_KEY = "drafting-guide-seen";

// Opens the drafting guide - shown to everyone who can draft, and on their first visit by itself
export default function DraftingGuideButton() {
    const canDraft = usePermission(Permission.CREATE_CARDS);
    const guide = useTabGuideModal(DRAFTING_GUIDE_SEEN_KEY, canDraft);
    if (!canDraft) {
        return null;
    }
    return (
        <>
            <Button
                color="primary"
                variant="flat"
                size="sm"
                startContent={<FontAwesomeIcon icon={faCircleQuestion} />}
                onPress={guide.open}
                className="hidden sm:flex font-cinzel shrink-0 font-semibold"
            >
                Drafting Guide
            </Button>
            <GuideBubble label="Drafting Guide" onOpen={guide.open} />
            <DraftingGuideModal isOpen={guide.isOpen} onClose={guide.close} />
        </>
    );
}
