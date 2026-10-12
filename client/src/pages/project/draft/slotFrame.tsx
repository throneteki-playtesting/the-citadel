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
import { faChevronDown, faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { CSSProperties, memo, useState } from "react";
import classNames from "classnames";
import { ISlot, previewUrlOf } from "common/models/slots";
import Permission from "common/models/permissions";
import { openDiscordLink, useDiscordHref, useDiscordTarget } from "../../../hooks/useDiscordLink";
import { useSlotSync } from "../../../hooks/useSync";
import { usePermission } from "../../../hooks/usePermission";
import { BaseElementProps } from "../../../types";
import SlotOptionsSummary from "../../../components/slots/slotOptionsSummary";
import { FLAT_BUTTON_CLASS, highlightTarget } from "../../../constants";
import { HighlightTarget } from "../../../components/highlightTarget";

// The slot beneath its cards - what it asks for and what can be done with it, apart from any one card in it
export default function SlotFrame({ className, style, slot, actions, isRevealed = false, children }: SlotFrameProps) {
    return (
        <HighlightTarget
            targetId={highlightTarget.slot(slot.project, slot.number)}
            style={style}
            className={classNames(
                "shrink-0 flex flex-col gap-1 rounded-lg border border-content3 bg-content2/40 p-1",
                className
            )}
        >
            <div
                className={classNames(
                    "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-success/10 ring-2 ring-inset ring-success/70 transition-opacity duration-500",
                    isRevealed ? "opacity-100" : "opacity-0"
                )}
            />
            <SlotFrameHeader slot={slot} actions={actions} />
            {children}
        </HighlightTarget>
    );
}

// Apart from the cards, so it is only redrawn when the slot or what can be done with it changes
const SlotFrameHeader = memo(function SlotFrameHeader({ slot, actions }: Pick<SlotFrameProps, "slot" | "actions">) {
    const canReadForum = usePermission(Permission.READ_DISCORD_PLANNING_FORUM);
    const canReadCardForum = usePermission(Permission.READ_DISCORD_CARD_FORUM);
    const discussionUrl = slot._metadata?.discord?.messageUrl;
    const previewUrl = slot._metadata?.preview && previewUrlOf(slot._metadata.preview);
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
                {(discussionUrl || previewUrl) && (
                    <SlotDiscordLinks
                        slot={slot}
                        discussionUrl={canReadForum ? discussionUrl : undefined}
                        previewUrl={canReadCardForum ? previewUrl : undefined}
                    />
                )}
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
                                                busyKey === action.key || action.isBusy ? (
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

const isWorking = ({ status }: { status?: string }) => status === "start" || status === "progress";

// The slot's Discord threads this person can see - one goes straight to it, both offer a choice
function SlotDiscordLinks({ slot, discussionUrl, previewUrl }: SlotDiscordLinksProps) {
    const { discord, preview } = useSlotSync(slot);
    const [isOpen, setIsOpen] = useState(false);
    const target = useDiscordTarget();
    const isBusy = (key: string) => isWorking(key === "discussion" ? discord : preview);
    const links = [
        discussionUrl && { key: "discussion", label: "Slot discussion", url: discussionUrl },
        previewUrl && { key: "preview", label: "Card preview", url: previewUrl }
    ].flatMap((link) => (link ? [link] : []));

    if (links.length === 0) {
        return null;
    }
    if (links.length === 1) {
        const [{ key, label, url }] = links;
        return <DiscordLink url={url} label={`Open ${label.toLowerCase()}`} isBusy={isBusy(key)} />;
    }
    return (
        <Dropdown isOpen={isOpen} onOpenChange={setIsOpen}>
            <DropdownTrigger>
                <Button
                    size="sm"
                    variant="light"
                    aria-label="Open in Discord"
                    className={classNames("h-6 min-w-0 gap-1 px-1.5", FLAT_BUTTON_CLASS)}
                >
                    <FontAwesomeIcon icon={faDiscord} />
                    <FontAwesomeIcon
                        icon={faChevronDown}
                        className={classNames("text-[0.6rem] transition-transform duration-200", {
                            "rotate-180": isOpen
                        })}
                    />
                </Button>
            </DropdownTrigger>
            <DropdownMenu
                aria-label="Slot Discord threads"
                onAction={(key) => openDiscordLink(links.find((link) => link.key === key)!.url, target)}
            >
                {links.map(({ key, label }) => (
                    <DropdownItem
                        key={key}
                        startContent={
                            isBusy(key) ? (
                                <Spinner size="sm" classNames={{ wrapper: "size-4" }} />
                            ) : (
                                <FontAwesomeIcon icon={faDiscord} fixedWidth />
                            )
                        }
                    >
                        {label}
                    </DropdownItem>
                ))}
            </DropdownMenu>
        </Dropdown>
    );
}

type SlotDiscordLinksProps = {
    slot: ISlot;
    discussionUrl?: string;
    previewUrl?: string;
};

// Wherever this browser opens Discord links - busy while whatever it leads to is being worked on
function DiscordLink({ url, label, isBusy = false }: { url: string; label: string; isBusy?: boolean }) {
    const { href, isApp } = useDiscordHref(url);
    return (
        <Tooltip content={label}>
            <Button
                as="a"
                href={href}
                target={isApp ? undefined : "_blank"}
                rel="noreferrer"
                isIconOnly
                size="sm"
                variant="light"
                aria-label={label}
                className={classNames("size-6 min-w-6", FLAT_BUTTON_CLASS)}
            >
                {isBusy ? (
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
    /** Something it leads to is being worked on, so the icon is a spinner in the meantime */
    isBusy?: boolean;
    /** One which returns a promise keeps the menu open, the item at work, until it settles */
    onPress: () => void | Promise<void>;
};

type SlotFrameProps = BaseElementProps & {
    style?: CSSProperties;
    slot: ISlot;
    /** The menu's actions in groups, each set apart from the next */
    actions: SlotAction[][];
    /** A card of the slot has been revealed to the design team */
    isRevealed?: boolean;
};
