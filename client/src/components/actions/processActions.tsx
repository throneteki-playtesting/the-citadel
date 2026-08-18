import { createPortal } from "react-dom";
import { Button, ButtonProps } from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { useIsPageActive } from "../../hooks/useIsPageActive";
import { UIColor } from "../../types";
import { TouchTooltip } from "../touchTooltip";

/** One action a person takes to move a record on, eg. saving it or adding to it */
export type ProcessAction = {
    key: string;
    label: string;
    icon: IconDefinition;
    color?: UIColor;
    variant?: ButtonProps["variant"];
    isDisabled?: boolean;
    /** For actions which already have a home in the layout, and only need lifting out on a phone */
    isMobileOnly?: boolean;
    onPress: () => void;
};

/**
 * The actions which progress whatever is on screen: buttons at the foot of the work on desktop, lifted
 * into a floating column beside the page's action button on a phone.
 */
export default function ProcessActions({ actions, className }: ProcessActionsProps) {
    // Only the portalled column needs this - the foot buttons travel with the page they belong to
    const isPageActive = useIsPageActive();

    if (actions.length === 0) {
        return null;
    }

    return (
        <>
            <div className={classNames("hidden sm:flex justify-end gap-2", className)}>
                {actions
                    .filter((action) => !action.isMobileOnly)
                    .map((action) => (
                        <Button
                            key={action.key}
                            color={action.color}
                            variant={action.variant}
                            isDisabled={action.isDisabled}
                            startContent={<FontAwesomeIcon icon={action.icon} />}
                            onPress={action.onPress}
                        >
                            {action.label}
                        </Button>
                    ))}
            </div>
            {isPageActive &&
                createPortal(
                    <div className="sm:hidden fixed bottom-6 right-20 z-20 flex items-center gap-2">
                        {actions.map((action) => (
                            <TouchTooltip key={action.key} content={action.label} placement="top">
                                <Button
                                    isIconOnly
                                    radius="full"
                                    size="lg"
                                    className="shadow-lg"
                                    aria-label={action.label}
                                    color={action.color}
                                    variant={action.variant}
                                    isDisabled={action.isDisabled}
                                    onPress={action.onPress}
                                >
                                    <FontAwesomeIcon icon={action.icon} />
                                </Button>
                            </TouchTooltip>
                        ))}
                    </div>,
                    document.body
                )}
        </>
    );
}

type ProcessActionsProps = {
    actions: ProcessAction[];
    className?: string;
};
