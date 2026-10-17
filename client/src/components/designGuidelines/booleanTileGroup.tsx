import { memo } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import AnswerTileButton from "./answerTileButton";

interface BooleanTileOption {
    value: boolean;
    label: string;
    description: string;
}

/** Two large answer tiles, label + description each - the shared shape behind the Iconic, Natural
 *  Trigger and Safely Limited questions. */
const BooleanTileGroup = ({ className, style, options, value, onChange, isDisabled }: BooleanTileGroupProps) => {
    return (
        <div className={classNames("grid grid-cols-1 sm:grid-cols-2 gap-2", className)} style={style}>
            {options.map((option) => (
                <AnswerTileButton
                    key={String(option.value)}
                    label={option.label}
                    description={option.description}
                    isOn={value !== undefined && value === option.value}
                    isDisabled={isDisabled}
                    onPress={() => onChange(option.value)}
                />
            ))}
        </div>
    );
};

type BooleanTileGroupProps = Omit<BaseElementProps, "children"> & {
    options: BooleanTileOption[];
    value: boolean | undefined;
    onChange: (value: boolean) => void;
    isDisabled?: boolean;
};

export default memo(BooleanTileGroup);
