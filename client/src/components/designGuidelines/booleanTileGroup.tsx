import { memo } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { answerTileClasses } from "../../constants";

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
            {options.map((option) => {
                const isOn = value !== undefined && value === option.value;
                return (
                    <button
                        type="button"
                        key={String(option.value)}
                        disabled={isDisabled}
                        aria-pressed={isOn}
                        onClick={() => onChange(option.value)}
                        className={classNames(
                            "flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
                            answerTileClasses(isOn, isDisabled)
                        )}
                    >
                        <span
                            className={classNames(
                                "text-sm font-semibold",
                                isOn ? "text-primary" : "text-foreground/80"
                            )}
                        >
                            {option.label}
                        </span>
                        <span className="text-xs text-foreground/60">{option.description}</span>
                    </button>
                );
            })}
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
