import { createPortal } from "react-dom";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { FLOATING_SLOT_INSET_REM, FLOATING_SLOT_STEP_REM } from "../constants";
import { useIsPageActive } from "../hooks/useIsPageActive";
import { useNextFloatingSlot } from "../hooks/useFloatingSlots";

// Below `sm` a page's guide is a bubble at the bottom right, in the left-most place the page's other floating buttons
// leave. Portalled, as a transformed ancestor would move a fixed child, and so held to the page which is on show
export default function GuideBubble({ label, onOpen, isActive = true }: GuideBubbleProps) {
    const isPageActive = useIsPageActive();
    const slot = useNextFloatingSlot();
    if (!isActive || !isPageActive) {
        return null;
    }
    return createPortal(
        <div
            className="sm:hidden fixed bottom-6 z-20"
            style={{ right: `${FLOATING_SLOT_INSET_REM + FLOATING_SLOT_STEP_REM * slot}rem` }}
        >
            <Button
                isIconOnly
                radius="full"
                size="lg"
                color="primary"
                className="shadow-lg"
                aria-label={label}
                onPress={onOpen}
            >
                <FontAwesomeIcon icon={faCircleQuestion} className="text-2xl" />
            </Button>
        </div>,
        document.body
    );
}

type GuideBubbleProps = {
    label: string;
    onOpen: () => void;
    /** False while the guide's own tab is not the one on show */
    isActive?: boolean;
};
