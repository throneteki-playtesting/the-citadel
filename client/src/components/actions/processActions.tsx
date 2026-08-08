import { createPortal } from "react-dom";
import { Button } from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { UIColor } from "../../types";
import { TouchTooltip } from "../touchTooltip";

/** One action a person takes to move a record on, eg. saving it or adding to it */
export type ProcessAction = {
    key: string;
    label: string;
    icon: IconDefinition;
    color?: UIColor;
    variant?: "solid" | "flat" | "light" | "bordered";
    isDisabled?: boolean;
    /** For actions which already have a home in the layout, and only need lifting out on a phone */
    isMobileOnly?: boolean;
    onPress: () => void;
};

/**
 * The actions which actually progress whatever is on screen. On desktop they read as buttons at the foot
 * of the work; on a phone they lift out into the floating column beside the page's own action button,
 * where they stay reachable however far down the form somebody has scrolled.
 *
 * Deliberately one component rather than two sets of markup - the mobile and desktop forms drifting apart
 * is how a save button ends up existing on only one of them.
 */
export default function ProcessActions({ actions, className }: ProcessActionsProps) {
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

            {createPortal(
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
