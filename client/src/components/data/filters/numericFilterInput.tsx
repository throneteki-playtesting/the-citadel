import classNames from "classnames";
import { BaseElementProps } from "../../../types";
import { NumericFilterValue, NumericOperator } from "./numeric";

const OPERATORS: { key: NumericOperator; label: string }[] = [
    { key: "lt", label: "<" },
    { key: "eq", label: "=" },
    { key: "gt", label: ">" }
];

type NumericFilterInputProps = Omit<BaseElementProps, "children"> & {
    label: string;
    value?: NumericFilterValue;
    onChange: (value?: NumericFilterValue) => void;
    isDisabled?: boolean;
};

// A hand-fused operator+value control (rather than a separate ButtonGroup + Input) so it reads
// as one seamless input rather than two adjacent components.
const NumericFilterInput = ({ className, style, label, value, onChange, isDisabled }: NumericFilterInputProps) => {
    const setOperator = (operator: NumericOperator) => {
        // Tapping the already-active operator clears the filter entirely
        if (value?.operator === operator) {
            onChange(undefined);
            return;
        }
        onChange({ operator, value: value?.value ?? 0 });
    };
    const setValue = (raw: string) => {
        const asNumber = parseInt(raw, 10);
        if (isNaN(asNumber)) {
            onChange(undefined);
            return;
        }
        onChange({ operator: value?.operator ?? "eq", value: asNumber });
    };
    return (
        <div
            className={classNames(
                "flex items-stretch h-8 rounded-small bg-default-100 overflow-hidden",
                "focus-within:ring-2 focus-within:ring-primary/50",
                { "opacity-50 pointer-events-none": isDisabled },
                className
            )}
            style={style}
        >
            {OPERATORS.map((op) => {
                const isSelected = value?.operator === op.key;
                return (
                    <button
                        key={op.key}
                        type="button"
                        onClick={() => setOperator(op.key)}
                        className={classNames(
                            "w-7 text-sm font-semibold border-r border-default-200 transition-colors",
                            isSelected
                                ? "bg-primary text-primary-foreground"
                                : "text-default-500 hover:bg-default-200"
                        )}
                    >
                        {op.label}
                    </button>
                );
            })}
            <input
                type="number"
                placeholder={label}
                value={value?.value?.toString() ?? ""}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1 min-w-0 bg-transparent px-2 text-sm outline-none placeholder:text-default-400"
            />
        </div>
    );
};

export default NumericFilterInput;
