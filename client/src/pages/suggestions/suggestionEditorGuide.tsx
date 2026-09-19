import { useEffect, useState } from "react";
import {
    faIdCard,
    faWandMagicSparkles,
    faScaleBalanced,
    faCompass,
    faLink,
    faListCheck,
    faCircleQuestion,
    IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Checkbox, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { BaseElementProps } from "../../types";

// Flips the guide from "unseen" to "dismissed" once someone says so, never resurfacing on this browser again.
export const SUGGESTION_EDITOR_GUIDE_DISMISSED_KEY = "suggestion-editor-guide-dismissed";

export function isSuggestionEditorGuideDismissed(): boolean {
    try {
        return localStorage.getItem(SUGGESTION_EDITOR_GUIDE_DISMISSED_KEY) === "true";
    } catch {
        // Private browsing / storage disabled - fail open (show the guide) rather than throw.
        return false;
    }
}

const STEPS: { icon: IconDefinition; title: string; description: string }[] = [
    {
        icon: faIdCard,
        title: "Design the Card",
        description: "This is where you design the card itself - a live preview updates as you go."
    },
    {
        icon: faWandMagicSparkles,
        title: "Theme & Abilities",
        description: "Rate how thematically iconic the design is, and describe how its abilities behave."
    },
    {
        icon: faScaleBalanced,
        title: "Rewards & Punishments",
        description: "Mark the rewards it grants overall, and any punishment it imposes on its own controller."
    },
    {
        icon: faCompass,
        title: "Pivot Points",
        description: "Outline what you'd consider the best areas to finetune this card for balance."
    },
    {
        icon: faLink,
        title: "Comparable & Combo Cards",
        description: "Note any printed cards worth comparing this design to, or that it works well with."
    },
    {
        icon: faListCheck,
        title: "Checklist Review",
        description: "Walk the checklist, justify anything flagged, and leave any notes a reviewer should see."
    }
];

/** A static step-by-step overview shown before the suggestion wizard - its own standalone Modal,
 *  soft-closing the editor's behind it rather than a screen swapped into the same one. */
export default function SuggestionEditorGuide({ isOpen, onDismiss, onClose }: SuggestionEditorGuideProps) {
    const [dontShowAgain, setDontShowAgain] = useState(isSuggestionEditorGuideDismissed);
    // Re-syncs on every open since this component stays mounted, so the lazy initializer only runs once.
    useEffect(() => {
        if (isOpen) {
            setDontShowAgain(isSuggestionEditorGuideDismissed());
        }
    }, [isOpen]);

    const getStarted = () => {
        try {
            if (dontShowAgain) {
                localStorage.setItem(SUGGESTION_EDITOR_GUIDE_DISMISSED_KEY, "true");
            } else {
                localStorage.removeItem(SUGGESTION_EDITOR_GUIDE_DISMISSED_KEY);
            }
        } catch {
            // Nothing to do if storage is unavailable - it'll just show again next time regardless.
        }
        onDismiss();
    };

    return (
        <Modal
            isOpen={isOpen}
            placement="center"
            size="3xl"
            scrollBehavior="inside"
            className="max-h-[90vh]"
            onOpenChange={(open) => !open && onDismiss()}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1 font-cinzel text-lg sm:text-2xl">
                    Creating a Suggestion
                </ModalHeader>
                <ModalBody className="pb-4 sm:pb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                        {STEPS.map((step, index) => (
                            <div
                                key={step.title}
                                className="relative flex flex-col items-center gap-1 sm:gap-2 rounded-lg border border-content3 bg-content1 p-3 sm:p-4 text-center"
                            >
                                <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                                    {index + 1}
                                </span>
                                <FontAwesomeIcon icon={step.icon} className="text-primary text-3xl sm:text-4xl" />
                                <div className="font-cinzel font-semibold text-sm sm:text-base">{step.title}</div>
                                <div className="text-xs sm:text-sm text-foreground/70">{step.description}</div>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-content3 bg-content2 p-3">
                        <FontAwesomeIcon icon={faCircleQuestion} className="shrink-0 text-primary text-2xl" />
                        <div className="text-sm text-foreground/70">
                            Stuck on a question? Every one along the way has its own help icon, just like this one,
                            explaining what it means and why it matters, with a few real examples.
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter className="flex flex-col sm:flex-row sm:justify-between items-center gap-3">
                    <Checkbox isSelected={dontShowAgain} onValueChange={setDontShowAgain} size="sm">
                        Please do not show me this again
                    </Checkbox>
                    <div className="flex w-full sm:w-auto items-center gap-3">
                        <Button
                            variant="light"
                            className="font-cinzel font-semibold flex-1 sm:flex-none"
                            onPress={onClose}
                        >
                            Close
                        </Button>
                        <Button
                            color="primary"
                            className="font-cinzel font-semibold flex-1 sm:flex-none"
                            onPress={getStarted}
                        >
                            Get Started
                        </Button>
                    </div>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type SuggestionEditorGuideProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    /** Dismisses the guide alone, revealing the editor underneath - "Get Started". */
    onDismiss: () => void;
    /** Closes the whole editor flow, guide included - "Close". */
    onClose: () => void;
};
