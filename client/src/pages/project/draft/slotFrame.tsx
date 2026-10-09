import {
    Button,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownSection,
    DropdownTrigger,
    Spinner,
    Tooltip
} from "@heroui/react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { CSSProperties, memo, useState } from "react";
import classNames from "classnames";
import { ISlot } from "common/models/slots";
import Permission from "common/models/permissions";
import { useDiscordHref } from "../../../hooks/useDiscordLink";
import { useSlotSync } from "../../../hooks/useSync";
import { usePermission } from "../../../hooks/usePermission";
import { BaseElementProps } from "../../../types";
import SlotOptionsSummary from "../../../components/slots/slotOptionsSummary";
import { FLAT_BUTTON_CLASS, highlightTarget } from "../../../constants";
import { HighlightTarget } from "../../../components/highlightTarget";

// The slot beneath its cards - what it asks for and what can be done with it, apart from any one card in it
export default function SlotFrame({ className, style, slot, actions, children }: SlotFrameProps) {
    return (
        <HighlightTarget
            targetId={highlightTarget.slot(slot.project, slot.number)}
            style={style}
            className={classNames(
                "shrink-0 flex flex-col gap-1 rounded-lg border border-content3 bg-content2/40 p-1",
                className
            )}
        >
            <SlotFrameHeader slot={slot} actions={actions} />
            {children}
        </HighlightTarget>
    );
}

// Apart from the cards, so it is only redrawn when the slot or what can be done with it changes
const SlotFrameHeader = memo(function SlotFrameHeader({ slot, actions }: Pick<SlotFrameProps, "slot" | "actions">) {
    const canReadForum = usePermission(Permission.READ_DISCORD_PLANNING_FORUM);
    const discussionUrl = slot._metadata?.discord?.messageUrl;
    const [isOpen, setIsOpen] = useState(false);
    const [busyKey, setBusyKey] = useState<string>();

    // The menu stays open, with the item at work, while an action which takes time is being carried out
    const press = async (action: SlotAction) => {
        const result = action.onPress();
        if (!(result instanceof Promise)) {
            setIsOpen(false);
            return;
        }
        setBusyKey(action.key);
        try {
            await result;
        } finally {
            setBusyKey(undefined);
            setIsOpen(false);
        }
    };
    const disabledKeys = busyKey
        ? actions
              .flat()
              .map((action) => action.key)
              .filter((key) => key !== busyKey)
        : [];
    return (
        <div className="flex h-6 w-0 min-w-full items-center gap-2 pl-1 text-xs text-foreground/60">
            <span className="shrink-0 font-semibold text-foreground">#{slot.number}</span>
            <SlotOptionsSummary options={slot} />
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {canReadForum && discussionUrl && <DiscussionLink slot={slot} url={discussionUrl} />}
                {actions.length > 0 && (
                    <Dropdown isOpen={isOpen} onOpenChange={(open) => !busyKey && setIsOpen(open)}>
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
                        <DropdownMenu
                            aria-label={`Slot #${slot.number} actions`}
                            closeOnSelect={false}
                            disabledKeys={disabledKeys}
                        >
                            {actions.map((group, index) => (
                                <DropdownSection key={group[0].key} showDivider={index < actions.length - 1}>
                                    {group.map((action) => (
                                        <DropdownItem
                                            key={action.key}
                                            startContent={
                                                busyKey === action.key ? (
                                                    <Spinner size="sm" classNames={{ wrapper: "size-4" }} />
                                                ) : (
                                                    <FontAwesomeIcon icon={action.icon} fixedWidth />
                                                )
                                            }
                                            onPress={() => press(action)}
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

function DiscussionLink({ slot, url }: { slot: ISlot; url: string }) {
    const { href, isApp } = useDiscordHref(url);
    const { status } = useSlotSync(slot).discord;
    const isSyncing = status === "start" || status === "progress";
    return (
        <Tooltip content="Open discussion">
            <Button
                as="a"
                href={href}
                target={isApp ? undefined : "_blank"}
                rel="noreferrer"
                isIconOnly
                size="sm"
                variant="light"
                aria-label="Open discussion"
                className={classNames("size-6 min-w-6", FLAT_BUTTON_CLASS)}
            >
                {isSyncing ? (
                    <Spinner size="sm" classNames={{ wrapper: "size-3.5" }} />
                ) : (
                    <FontAwesomeIcon icon={faDiscord} />
                )}
            </Button>
        </Tooltip>
    );
}

export type SlotAction = {
    key: string;
    label: string;
    icon: IconDefinition;
    /** One which returns a promise keeps the menu open, the item at work, until it settles */
    onPress: () => void | Promise<void>;
};

type SlotFrameProps = BaseElementProps & {
    style?: CSSProperties;
    slot: ISlot;
    /** The menu's actions in groups, each set apart from the next */
    actions: SlotAction[][];
};
