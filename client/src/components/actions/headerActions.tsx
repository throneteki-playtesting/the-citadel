import { Button, ButtonGroup, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { useMemo } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { TouchTooltip } from "../touchTooltip";
import { ActionItem } from "./types";

// Navigates directly rather than passing href to Button/DropdownItem - this app's HeroUIProvider
// routes any href through react-router's useHref for client-side navigation, which mangles external
// URLs (eg. discord://...) instead of leaving them alone.
function openItem(item: ActionItem) {
    if (!item.href) {
        item.onPress?.();
        return;
    }
    if (item.openInNewTab !== false) {
        window.open(item.href, "_blank", "noreferrer");
    } else {
        window.location.href = item.href;
    }
}

export default function HeaderActions({ items, className }: HeaderActionsProps) {
    const resolvedItems = useMemo(() => items.filter((item): item is ActionItem => !!item), [items]);

    if (resolvedItems.length === 0) {
        return null;
    }

    return (
        <div className={className}>
            <ButtonGroup className="hidden sm:flex">
                {resolvedItems.map((item) => (
                    <TouchTooltip
                        key={item.key}
                        content={
                            <div className="flex flex-col">
                                <div className="font-bold">{item.title}</div>
                                {item.description && <div>{item.description}</div>}
                            </div>
                        }
                    >
                        <Button
                            isIconOnly
                            color={item.color}
                            isDisabled={item.isDisabled}
                            isLoading={item.isLoading}
                            // The badge sits inside the button (ButtonGroup rounds its direct children),
                            // and z-10 lifts it out of the base z-0 the next button would paint over
                            className={classNames("overflow-visible", item.badge && "z-10")}
                            onPress={() => openItem(item)}
                        >
                            {item.icon}
                            {!!item.badge && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-secondary text-secondary-foreground text-tiny font-medium flex items-center justify-center">
                                    {item.badge}
                                </span>
                            )}
                        </Button>
                    </TouchTooltip>
                ))}
            </ButtonGroup>
            <div className="sm:hidden fixed bottom-6 right-4 z-20">
                <Dropdown placement="top-end">
                    <DropdownTrigger>
                        <Button isIconOnly radius="full" size="lg" color="primary" className="shadow-lg">
                            <FontAwesomeIcon icon={faEllipsisVertical} />
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                        aria-label="Actions"
                        disabledKeys={resolvedItems.filter((item) => item.isDisabled).map((item) => item.key)}
                        onAction={(key) => {
                            const item = resolvedItems.find((item) => item.key === key);
                            if (item) {
                                openItem(item);
                            }
                        }}
                    >
                        {resolvedItems.map((item) => (
                            <DropdownItem
                                key={item.key}
                                color={item.color}
                                description={item.description}
                                startContent={item.icon}
                                endContent={
                                    item.badge ? (
                                        <Chip size="sm" variant="flat" color="secondary">
                                            {item.badge}
                                        </Chip>
                                    ) : undefined
                                }
                                closeOnSelect={!item.keepOpen}
                            >
                                {item.title}
                            </DropdownItem>
                        ))}
                    </DropdownMenu>
                </Dropdown>
            </div>
        </div>
    );
}

type HeaderActionsProps = Omit<BaseElementProps, "children"> & {
    items: (ActionItem | false | null | undefined)[];
};
