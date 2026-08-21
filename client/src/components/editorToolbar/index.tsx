import { Button, Divider, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { memo, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { TouchTooltip } from "../touchTooltip";

export type ToolbarButtonItem = {
    kind?: "button";
    key: string;
    label: string;
    shortcut?: string;
    command: () => void;
    isActive?: boolean;
    className?: string;
    icon: ReactNode;
};

export type ToolbarItem = ToolbarButtonItem | { kind: "divider"; key: string };

// Memoised, as a toolbar sits above an editor re-rendering on every keystroke. Every prop is a primitive
// or a stable callback, so a button re-renders only when the button itself changes
export const EditorButton = memo(function EditorButton({
    label,
    shortcut,
    command,
    isActive,
    isDisabled,
    className,
    children
}: {
    label: string;
    shortcut?: string;
    command: () => void;
    isActive?: boolean;
    isDisabled?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <TouchTooltip content={shortcut ? `${label} (${shortcut})` : label} size="sm" delay={500} closeDelay={0}>
            <Button
                className={classNames(
                    "shrink-0 size-8 min-w-8 sm:size-7 sm:min-w-7 transition-transform data-[pressed=true]:scale-90",
                    className
                )}
                aria-label={label}
                // Kept off mousedown, or the selection the command acts on is lost to the button first
                onMouseDown={(e) => {
                    e.preventDefault();
                    command();
                }}
                isIconOnly={true}
                radius="sm"
                size="sm"
                variant={isActive ? "solid" : "light"}
                color={isActive ? "primary" : "default"}
                isDisabled={isDisabled}
            >
                {children}
            </Button>
        </TouchTooltip>
    );
});

export const ToolbarDivider = () => <Divider orientation="vertical" className="shrink-0 h-5 mx-0.5" />;

const GAP = 2;
// A 1px rule plus the mx-0.5 either side of it
const DIVIDER_WIDTH = 5;

function isDivider(item: ToolbarItem): item is { kind: "divider"; key: string } {
    return item.kind === "divider";
}

// As many controls as the row holds, the rest behind one overflow button - a sideways-scrolling toolbar
// hides itself behind a gesture nobody makes. Items are in priority order; the first survive a narrow screen
export const OverflowToolbar = memo(function OverflowToolbar({
    items,
    isDisabled,
    className
}: {
    items: ToolbarItem[];
    isDisabled?: boolean;
    className?: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleCount, setVisibleCount] = useState(items.length);

    // What the row is made of, which is all the measurement cares about - the list itself is rebuilt
    // whenever a mark flips active, and that can never move a button
    const layout = useMemo(() => items.map((item) => (isDivider(item) ? "|" : "b")).join(""), [items]);

    const itemsRef = useRef(items);
    useEffect(() => {
        itemsRef.current = items;
    });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const measure = () => {
            const items = itemsRef.current;
            const available = container.clientWidth;
            // Every button is the same size, so one of them stands for all of them
            const button = container.querySelector("button") as HTMLElement | null;
            const buttonWidth = (button?.offsetWidth ?? 28) + GAP;
            const widthOf = (item: ToolbarItem) => (isDivider(item) ? DIVIDER_WIDTH + GAP : buttonWidth);

            let used = 0;
            let count = 0;
            for (const item of items) {
                const width = widthOf(item);
                if (used + width > available) {
                    break;
                }
                used += width;
                count += 1;
            }

            if (count < items.length) {
                // The overflow button has to fit as well, so it takes back whatever room it needs
                while (count > 0 && used + buttonWidth > available) {
                    used -= widthOf(items[count - 1]);
                    count -= 1;
                }
                // A rule with nothing after it is just a stray line
                while (count > 0 && isDivider(items[count - 1])) {
                    count -= 1;
                }
            }

            setVisibleCount(count);
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        return () => observer.disconnect();
    }, [layout]);

    const visible = items.slice(0, visibleCount);
    const overflowed = items.slice(visibleCount);
    const overflowedButtons = overflowed.filter((item): item is ToolbarButtonItem => !isDivider(item));

    return (
        <div ref={containerRef} className={classNames("flex items-center gap-0.5 min-w-0 overflow-hidden", className)}>
            {visible.map((item) =>
                isDivider(item) ? (
                    <ToolbarDivider key={item.key} />
                ) : (
                    <EditorButton
                        key={item.key}
                        label={item.label}
                        shortcut={item.shortcut}
                        command={item.command}
                        isActive={item.isActive}
                        isDisabled={isDisabled}
                        className={item.className}
                    >
                        {item.icon}
                    </EditorButton>
                )
            )}
            {overflowedButtons.length > 0 && (
                <Dropdown placement="bottom-end">
                    <DropdownTrigger>
                        <Button
                            className="shrink-0 size-8 min-w-8 sm:size-7 sm:min-w-7 ms-auto"
                            aria-label={`${overflowedButtons.length} more controls`}
                            isIconOnly={true}
                            radius="sm"
                            size="sm"
                            variant="light"
                            isDisabled={isDisabled}
                        >
                            <FontAwesomeIcon icon={faEllipsis} />
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                        aria-label="More controls"
                        onAction={(key) => overflowedButtons.find((item) => item.key === key)?.command()}
                        itemClasses={{ base: "gap-2" }}
                    >
                        {overflowedButtons.map((item) => {
                            // A rule which fell into the overflow becomes the break under the item before it,
                            // as heroui draws a divider beneath the item carrying it
                            const next = overflowed[overflowed.indexOf(item) + 1];
                            const follows = !!next && isDivider(next);
                            return (
                                <DropdownItem
                                    key={item.key}
                                    startContent={<span className="w-4 text-center">{item.icon}</span>}
                                    textValue={item.label}
                                    className={item.isActive ? "text-primary" : ""}
                                    showDivider={follows}
                                >
                                    {item.label}
                                </DropdownItem>
                            );
                        })}
                    </DropdownMenu>
                </Dropdown>
            )}
        </div>
    );
});
