import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, Tooltip } from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { CSSProperties, memo } from "react";
import classNames from "classnames";
import { ISlot } from "common/models/slots";
import Permission from "common/models/permissions";
import { usePermission } from "../../../hooks/usePermission";
import { BaseElementProps } from "../../../types";
import SlotOptionsSummary from "../../../components/slots/slotOptionsSummary";
import { FLAT_BUTTON_CLASS } from "../../../constants";

// The slot beneath its cards - what it asks for and what can be done with it, apart from any one card in it
export default function SlotFrame({ className, style, slot, actions, children }: SlotFrameProps) {
    return (
        <div
            style={style}
            className={classNames(
                "shrink-0 flex flex-col gap-1 rounded-lg border border-content3 bg-content2/40 p-1",
                className
            )}
        >
            <SlotFrameHeader slot={slot} actions={actions} />
            {children}
        </div>
    );
}

// Apart from the cards, so it is only redrawn when the slot or what can be done with it changes
const SlotFrameHeader = memo(function SlotFrameHeader({ slot, actions }: Pick<SlotFrameProps, "slot" | "actions">) {
    const canReadForum = usePermission(Permission.READ_DISCORD_PLANNING_FORUM);
    const discussionUrl = slot._metadata?.discord?.messageUrl;
    return (
        <div className="flex h-6 w-0 min-w-full items-center gap-2 pl-1 text-xs text-foreground/60">
            <span className="shrink-0 font-semibold text-foreground">#{slot.number}</span>
            <SlotOptionsSummary options={slot} />
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {canReadForum && discussionUrl && (
                    <Tooltip content="Open discussion">
                        <Button
                            as="a"
                            href={discussionUrl}
                            target="_blank"
                            rel="noreferrer"
                            isIconOnly
                            size="sm"
                            variant="light"
                            aria-label="Open discussion"
                            className={classNames("size-6 min-w-6", FLAT_BUTTON_CLASS)}
                        >
                            <FontAwesomeIcon icon={faDiscord} />
                        </Button>
                    </Tooltip>
                )}
                {actions.length > 0 && (
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                aria-label={`Slot #${slot.number} actions`}
                                className={classNames("size-6 min-w-6", FLAT_BUTTON_CLASS)}
                            >
                                <FontAwesomeIcon icon={faEllipsisVertical} />
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label={`Slot #${slot.number} actions`}>
                            {actions.map((group, index) => (
                                <DropdownSection key={group[0].key} showDivider={index < actions.length - 1}>
                                    {group.map((action) => (
                                        <DropdownItem
                                            key={action.key}
                                            startContent={<FontAwesomeIcon icon={action.icon} fixedWidth />}
                                            onPress={action.onPress}
                                        >
                                            {action.label}
                                        </DropdownItem>
                                    ))}
                                </DropdownSection>
                            ))}
                        </DropdownMenu>
                    </Dropdown>
                )}
            </div>
        </div>
    );
});

export type SlotAction = {
    key: string;
    label: string;
    icon: IconDefinition;
    onPress: () => void;
};

type SlotFrameProps = BaseElementProps & {
    style?: CSSProperties;
    slot: ISlot;
    /** The menu's actions in groups, each set apart from the next */
    actions: SlotAction[][];
};
