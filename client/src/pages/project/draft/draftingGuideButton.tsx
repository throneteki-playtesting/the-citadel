import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import { useTabGuideModal } from "../../../hooks/useTabGuideModal";
import DraftingGuideModal from "./draftingGuideModal";

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
            <Button
                isIconOnly
                color="primary"
                variant="flat"
                size="sm"
                aria-label="Drafting Guide"
                onPress={guide.open}
                className="sm:hidden shrink-0"
            >
                <FontAwesomeIcon icon={faCircleQuestion} />
            </Button>
            <DraftingGuideModal isOpen={guide.isOpen} onClose={guide.close} />
        </>
    );
}
