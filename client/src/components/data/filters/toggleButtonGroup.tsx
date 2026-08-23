import { Button, ButtonGroup } from "@heroui/react";
import classNames from "classnames";
import { ReactNode } from "react";
import { BaseElementProps } from "../../../types";
import { FILTER_LABEL_CLASS, FILTER_ROW_CLASS } from "./layout";

export type ToggleOption<T extends string> = {
    key: T;
    label: string;
    icon?: ReactNode;
};

type ToggleButtonGroupProps<T extends string> = Omit<BaseElementProps, "children"> & {
    // Omit when the options are already self-explanatory (eg. icon-only rows)
    label?: string;
    options: ToggleOption<T>[];
    value: T[];
    onChange: (value: T[]) => void;
    isDisabled?: boolean;
};

const ToggleButtonGroup = <T extends string>({
    className,
    style,
    label,
    options,
    value,
    onChange,
    isDisabled
}: ToggleButtonGroupProps<T>) => {
    const toggle = (key: T) => {
        onChange(value.includes(key) ? value.filter((selected) => selected !== key) : [...value, key]);
    };
    return (
        <div className={classNames(FILTER_ROW_CLASS, className)} style={style}>
            {label && <div className={FILTER_LABEL_CLASS}>{label}</div>}
            <div
                className={classNames("min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden", {
                    "flex-1": !!label
                })}
            >
                <ButtonGroup size="sm" isDisabled={isDisabled} className="flex-nowrap">
                    {options.map((option) => {
                        const isSelected = value.includes(option.key);
                        return (
                            <Button
                                key={option.key}
                                isIconOnly={!!option.icon}
                                variant={isSelected ? "solid" : "flat"}
                                color={isSelected ? "primary" : "default"}
                                aria-label={option.label}
                                onPress={() => toggle(option.key)}
                                className="shrink-0"
                            >
                                {option.icon ?? option.label}
                            </Button>
                        );
                    })}
                </ButtonGroup>
            </div>
        </div>
    );
};

export default ToggleButtonGroup;
