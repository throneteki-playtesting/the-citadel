import { Children, CSSProperties, isValidElement, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { BaseElementProps } from "../types";
import { Button } from "@heroui/react";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCirclePlus } from "@fortawesome/free-solid-svg-icons";

const RadialMenu = ({
    className,
    style,
    children,
    isOpen,
    onOpenChange,
    orientation = "horizontal",
    triggerContent,
    classNames: classGroups,
    styles: styleGroups
}: RadialMenuProps) => {
    const [isActive, setIsActive] = useState(isOpen ?? false);

    useEffect(() => {
        setIsActive(isOpen ?? false);
    }, [isOpen]);

    const trigger = useMemo(() => {
        if (triggerContent) {
            return triggerContent;
        }
        return (
            <Button
                isIconOnly
                variant="light"
                size="sm"
                radius="full"
                className={classNames(
                    "absolute transition-all duration-500 ease-soft-spring cursor-pointer z-50 pointer-events-auto text-tiny md:text-small md:size-10 lg:text-medium lg:size-12",
                    isActive ? "text-2xl md:text-3xl lg:text-4xl rotate-45" : "text-5xl md:text-6xl lg:text-7xl",
                    classGroups?.button
                )}
                onPress={() => (onOpenChange ? onOpenChange(!isActive) : setIsActive(!isActive))}
                style={styleGroups?.button}
            >
                <FontAwesomeIcon icon={faCirclePlus} />
            </Button>
        );
    }, [classGroups?.button, isActive, onOpenChange, styleGroups?.button, triggerContent]);

    const angleCalc = useCallback(
        (index: number, total: number) => {
            if (orientation === "horizontal") {
                return (index * 2 * Math.PI) / total + Math.PI;
            }
            return (index * 2 * Math.PI) / total - Math.PI / 2;
        },
        [orientation]
    );

    const items = useMemo(() => {
        const activeItems: ReactNode[] = [];
        Children.forEach(children, (child) => {
            if (isValidElement(child)) {
                activeItems.push(child);
            }
        });

        return activeItems.map((item, index, arr) => {
            const angle = angleCalc(index, arr.length);

            return (
                <div
                    key={index}
                    className="absolute transition-all duration-500 ease-soft-spring pointer-events-none"
                    style={{
                        transform: isActive
                            ? `translate(calc(${Math.cos(angle)} * 50cqw), calc(${Math.sin(angle)} * 50cqw))`
                            : "translate(0, 0)",
                        opacity: isActive ? 1 : 0
                    }}
                >
                    <div className={isActive ? "pointer-events-auto" : "pointer-events-none"}>{item}</div>
                </div>
            );
        });
    }, [angleCalc, children, isActive]);

    if (items.length === 0) {
        return null;
    }

    return (
        <div
            className={classNames(
                "relative flex items-center justify-center [container-type:size] w-16 h-16",
                className,
                classGroups?.wrapper
            )}
            style={{ ...style, ...styleGroups?.wrapper }}
        >
            {trigger}
            {items}
        </div>
    );
};

export default RadialMenu;

type RadialMenuProps = BaseElementProps & {
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    orientation?: "horizontal" | "vertical";
    triggerContent?: ReactNode;
    classNames?: { wrapper?: string; button?: string };
    styles?: { wrapper?: CSSProperties; button?: CSSProperties };
};
