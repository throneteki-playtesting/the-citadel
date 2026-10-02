import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { ISlot } from "common/models/slots";
import { BaseElementProps } from "../../../types";
import SlotOptionsSummary from "../../../components/slots/slotOptionsSummary";

// The slot beneath its cards - what it asks for and what can be done with it, apart from any one card in it
export default function SlotFrame({ className, slot, actions, children }: SlotFrameProps) {
    return (
        <div
            className={classNames(
                "shrink-0 flex flex-col gap-1 rounded-lg border border-content3 bg-content2/40 p-1",
                className
            )}
        >
            <div className="flex h-6 w-0 min-w-full items-center gap-2 pl-1 text-xs text-foreground/60">
                <span className="shrink-0 font-semibold text-foreground">#{slot.number}</span>
                <SlotOptionsSummary options={slot} />
                {actions.length > 0 && (
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                aria-label={`Slot #${slot.number} actions`}
                                className="ml-auto size-6 min-w-6"
                            >
                                <FontAwesomeIcon icon={faEllipsisVertical} />
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label={`Slot #${slot.number} actions`} items={actions}>
                            {(action) => (
                                <DropdownItem
                                    key={action.key}
                                    startContent={<FontAwesomeIcon icon={action.icon} fixedWidth />}
                                    onPress={action.onPress}
                                >
                                    {action.label}
                                </DropdownItem>
                            )}
                        </DropdownMenu>
                    </Dropdown>
                )}
            </div>
            {children}
        </div>
    );
}

export type SlotAction = {
    key: string;
    label: string;
    icon: IconDefinition;
    onPress: () => void;
};

type SlotFrameProps = Omit<BaseElementProps, "style"> & {
    slot: ISlot;
    actions: SlotAction[];
};
