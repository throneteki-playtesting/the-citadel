import {
    Button,
    ButtonGroup,
    Chip,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownSection,
    DropdownTrigger,
    Tooltip
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { asInlineIcon } from "../status/asInlineIcon";
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

function renderDropdownItem(item: ActionItem) {
    return (
        <DropdownItem
            key={item.key}
            color={item.color}
            description={item.description}
            // Icons vary in width (brand glyphs, spinners, plain text), so they share a centred column
            startContent={<span className="min-w-6 flex items-center justify-center">{asInlineIcon(item.icon)}</span>}
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
    );
}

export default function HeaderActions({ items, className }: HeaderActionsProps) {
    const navigate = useNavigate();
    const resolvedItems = useMemo(() => items.filter((item): item is ActionItem => !!item), [items]);
    const buttonItems = useMemo(() => resolvedItems.filter((item) => !item.isDropdownOnly), [resolvedItems]);
    // Statuses read as state rather than as things to do, so the dropdown keeps them in their own section
    const statusItems = useMemo(() => resolvedItems.filter((item) => item.isStatus), [resolvedItems]);
    const actionItems = useMemo(() => resolvedItems.filter((item) => !item.isStatus), [resolvedItems]);

    if (resolvedItems.length === 0) {
        return null;
    }

    return (
        <div className={className}>
            <ButtonGroup className={classNames("hidden", { "sm:flex": buttonItems.length > 0 })}>
                {buttonItems.map((item) => {
                    // The badge sits inside the button (ButtonGroup rounds its direct children), and
                    // z-10 lifts it out of the base z-0 the next button would paint over
                    const buttonClassName = classNames("overflow-visible", item.badge && "z-10");
                    const buttonChildren = (
                        <>
                            {item.icon}
                            {!!item.badge && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-secondary text-secondary-foreground text-tiny font-medium flex items-center justify-center">
                                    {item.badge}
                                </span>
                            )}
                        </>
                    );

                    return (
                        <Tooltip
                            key={item.key}
                            content={
                                <div className="flex flex-col">
                                    <div className="font-bold">{item.title}</div>
                                    {item.description && <div>{item.description}</div>}
                                </div>
                            }
                        >
                            {item.to ? (
                                // Internal route: a real anchor, so middle/ctrl-click open a new tab
                                <Button
                                    as={Link}
                                    to={item.to}
                                    state={item.state}
                                    isIconOnly
                                    color={item.color}
                                    isDisabled={item.isDisabled}
                                    isLoading={item.isLoading}
                                    className={buttonClassName}
                                >
                                    {buttonChildren}
                                </Button>
                            ) : (
                                <Button
                                    isIconOnly
                                    color={item.color}
                                    isDisabled={item.isDisabled}
                                    isLoading={item.isLoading}
                                    className={buttonClassName}
                                    onPress={() => openItem(item)}
                                >
                                    {buttonChildren}
                                </Button>
                            )}
                        </Tooltip>
                    );
                })}
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
                            if (!item) {
                                return;
                            }
                            if (item.to) {
                                navigate(item.to, { state: item.state });
                            } else {
                                openItem(item);
                            }
                        }}
                    >
                        {[
                            ...(statusItems.length > 0
                                ? [
                                      <DropdownSection key="statuses" showDivider={actionItems.length > 0}>
                                          {statusItems.map(renderDropdownItem)}
                                      </DropdownSection>
                                  ]
                                : []),
                            ...(actionItems.length > 0
                                ? [
                                      <DropdownSection key="actions">
                                          {actionItems.map(renderDropdownItem)}
                                      </DropdownSection>
                                  ]
                                : [])
                        ]}
                    </DropdownMenu>
                </Dropdown>
            </div>
        </div>
    );
}

type HeaderActionsProps = Omit<BaseElementProps, "children"> & {
    items: (ActionItem | false | null | undefined)[];
};
