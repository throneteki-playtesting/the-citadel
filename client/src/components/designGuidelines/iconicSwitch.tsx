import { memo } from "react";
import { ICONIC_OPTIONS } from "common/designGuidelines/iconic";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { answerTileClasses } from "../../constants";

/** Two tiles, only one can ever be on. Starts with neither selected (`undefined` is a real third
 *  state here) so a submitter has to make the call themselves rather than inherit a default. */
const IconicSwitch = ({ className, style, value, onChange, isDisabled }: IconicSwitchProps) => {
    return (
        <div className={classNames("grid grid-cols-1 sm:grid-cols-2 gap-2", className)} style={style}>
            {ICONIC_OPTIONS.map((option) => {
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
                        <span className="text-xs text-foreground/60">
                            {option.description} Eg. {option.examples.join(", ")}.
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

type IconicSwitchProps = Omit<BaseElementProps, "children"> & {
    value: boolean | undefined;
    onChange: (value: boolean) => void;
    isDisabled?: boolean;
};

export default memo(IconicSwitch);
