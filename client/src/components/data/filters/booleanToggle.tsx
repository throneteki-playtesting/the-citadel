import { Button, ButtonGroup } from "@heroui/react";
import classNames from "classnames";
import { BaseElementProps } from "../../../types";

type BooleanToggleProps = Omit<BaseElementProps, "children"> & {
    trueLabel: string;
    falseLabel: string;
    value?: boolean;
    onChange: (value?: boolean) => void;
    isDisabled?: boolean;
};

// No standalone label - the button text (eg. "Loyal"/"Non-Loyal") carries the meaning on its own
const BooleanToggle = ({ className, style, trueLabel, falseLabel, value, onChange, isDisabled }: BooleanToggleProps) => {
    // Pressing the already-active button clears back to "any" (neither pressed)
    const press = (next: boolean) => onChange(value === next ? undefined : next);
    return (
        <ButtonGroup
            size="sm"
            isDisabled={isDisabled}
            className={classNames("flex justify-start", className)}
            style={style}
        >
            <Button
                variant={value === false ? "solid" : "flat"}
                color={value === false ? "primary" : "default"}
                onPress={() => press(false)}
            >
                {falseLabel}
            </Button>
            <Button
                variant={value === true ? "solid" : "flat"}
                color={value === true ? "primary" : "default"}
                onPress={() => press(true)}
            >
                {trueLabel}
            </Button>
        </ButtonGroup>
    );
};

export default BooleanToggle;
