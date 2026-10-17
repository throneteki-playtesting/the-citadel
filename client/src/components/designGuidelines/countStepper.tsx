import { memo } from "react";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { BaseElementProps } from "../../types";

/** A small stepper for a short 0-N count - minus/plus either side of the number, which carries the
 *  visual weight rather than a full-width numeric field's spinner arrows and label chrome. */
const CountStepper = ({ className, style, value, onChange, min = 0, max, isDisabled }: CountStepperProps) => {
    const count = value ?? min;
    const decrement = () => onChange(Math.max(min, count - 1));
    const increment = () => onChange(max !== undefined ? Math.min(max, count + 1) : count + 1);

    return (
        <div className={classNames("flex items-center gap-2", className)} style={style}>
            <Button
                isIconOnly
                size="sm"
                variant="flat"
                aria-label="Decrease"
                isDisabled={isDisabled || count <= min}
                onPress={decrement}
            >
                <FontAwesomeIcon icon={faMinus} />
            </Button>
            <span className="w-8 text-center text-2xl font-semibold tabular-nums">{count}</span>
            <Button
                isIconOnly
                size="sm"
                variant="flat"
                aria-label="Increase"
                isDisabled={isDisabled || (max !== undefined && count >= max)}
                onPress={increment}
            >
                <FontAwesomeIcon icon={faPlus} />
            </Button>
        </div>
    );
};

type CountStepperProps = Omit<BaseElementProps, "children"> & {
    value: number | undefined;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    isDisabled?: boolean;
};

export default memo(CountStepper);
