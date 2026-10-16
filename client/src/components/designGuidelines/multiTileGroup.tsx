import { memo } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import AnswerTileButton from "./answerTileButton";

interface MultiTileOption<T extends string> {
    value: T;
    label: string;
    description: string;
}

// Like BooleanTileGroup, but each tile toggles on its own and any number may be on
const MultiTileGroup = <T extends string>({
    className,
    style,
    options,
    value,
    onChange,
    isDisabled
}: MultiTileGroupProps<T>) => {
    const toggle = (option: T) =>
        onChange(value.includes(option) ? value.filter((entry) => entry !== option) : [...value, option]);

    return (
        <div className={classNames("grid grid-cols-1 sm:grid-cols-2 gap-2", className)} style={style}>
            {options.map((option) => (
                <AnswerTileButton
                    key={option.value}
                    label={option.label}
                    description={option.description}
                    isOn={value.includes(option.value)}
                    isDisabled={isDisabled}
                    onPress={() => toggle(option.value)}
                />
            ))}
        </div>
    );
};

type MultiTileGroupProps<T extends string> = Omit<BaseElementProps, "children"> & {
    options: MultiTileOption<T>[];
    value: T[];
    onChange: (value: T[]) => void;
    isDisabled?: boolean;
};

export default memo(MultiTileGroup) as typeof MultiTileGroup;
