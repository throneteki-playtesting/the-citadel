import { faArrowRight, faCheckCircle, faComments, faLightbulb, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import { BaseElementProps } from "../../types";

const STEPS: { icon: IconDefinition; title: string; description: string }[] = [
    {
        icon: faLightbulb,
        title: "Make a Suggestion",
        description: "Design a card and submit it for the community to see."
    },
    {
        icon: faComments,
        title: "React & Discuss",
        description: "Like or dislike card suggestions, and discuss them in Discord."
    },
    {
        icon: faPenToSquare,
        title: "Improve It",
        description: "Take the feedback on board and refine your own suggestions."
    }
];

/** Same "row of bordered step cards" language as the home page's How-To-Playtest guide - a static
 *  overview, not a stepped flow, since there's nothing here a viewer needs to do in order. */
export default function SuggestionsGuideModal({
    isOpen,
    onClose,
    onCreateSuggestion,
    onViewAll
}: SuggestionsGuideModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            placement="center"
            size="2xl"
            scrollBehavior="inside"
            className="max-h-[90vh]"
            onOpenChange={(open) => !open && onClose()}
        >
            <ModalContent>
                {(close) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1 font-cinzel text-lg sm:text-2xl">
                            How do suggestions work?
                        </ModalHeader>
                        <ModalBody className="pb-4 sm:pb-6">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                {STEPS.map((step) => (
                                    <div
                                        key={step.title}
                                        className="flex flex-col items-center text-center gap-1 sm:gap-2 border border-content3 bg-content1 rounded-lg p-3 sm:p-4"
                                    >
                                        <FontAwesomeIcon
                                            icon={step.icon}
                                            className="text-primary text-3xl sm:text-5xl"
                                        />
                                        <div className="font-cinzel font-semibold text-sm sm:text-base">
                                            {step.title}
                                        </div>
                                        <div className="text-xs sm:text-sm text-foreground/70">{step.description}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-3 border border-content3 bg-content1 rounded-lg p-3 sm:p-4">
                                <FontAwesomeIcon
                                    icon={faCheckCircle}
                                    className="text-primary text-3xl sm:text-4xl shrink-0"
                                />
                                <div className="text-sm text-foreground/70">
                                    <span className="font-cinzel font-semibold text-foreground">Approval. </span>
                                    From there, managers may approve suggestions, which highlights them for
                                    consideration in future projects - those with{" "}
                                    <span className="font-semibold text-foreground">
                                        {SUGGESTION_APPROVAL_VOTE_THRESHOLD} or more likes
                                    </span>{" "}
                                    get priority approval attention.
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 border border-content3 bg-content2 rounded-lg p-3">
                                <div className="flex-1 text-sm text-foreground/70">
                                    Not interested in a suggestion? Ignoring it hides it from your view - ignored
                                    suggestions can always be found again via the advanced filter.
                                </div>
                            </div>
                        </ModalBody>
                        <ModalFooter className="flex flex-col sm:flex-row gap-2">
                            {onCreateSuggestion && (
                                <Button
                                    color="primary"
                                    className="font-cinzel font-semibold w-full sm:w-auto"
                                    startContent={<FontAwesomeIcon icon={faLightbulb} />}
                                    onPress={() => {
                                        close();
                                        onCreateSuggestion();
                                    }}
                                >
                                    Create a Suggestion
                                </Button>
                            )}
                            <Button
                                variant="flat"
                                className="font-cinzel font-semibold w-full sm:w-auto"
                                endContent={<FontAwesomeIcon icon={faArrowRight} />}
                                onPress={() => {
                                    close();
                                    onViewAll();
                                }}
                            >
                                View All Suggestions
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

type SuggestionsGuideModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    onClose: () => void;
    /** Omitted (rather than passed a no-op) when the viewer lacks MAKE_SUGGESTIONS - hides the
     *  button entirely instead of offering an action that would just fail. */
    onCreateSuggestion?: () => void;
    onViewAll: () => void;
};
