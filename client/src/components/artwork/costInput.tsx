import { useState } from "react";
import { NumberInput, Select, SelectItem } from "@heroui/react";
import classNames from "classnames";
import { IArtworkCost } from "common/models/artwork";

// What commissions actually get paid in. The full ISO list is thousands of rows of noise for a picker
// nobody scrolls, and anything missing can be added here
const CURRENCIES = ["AUD", "HUF", "CAD", "EUR", "GBP", "USD"];

const DEFAULT_CURRENCY = "USD";

/**
 * What a commission cost, as one money field: the amount formats itself in the chosen currency, which is
 * picked at the trailing edge.
 *
 * The pick is held here as well as on the value, because a currency is choosable before there is any
 * amount to attach it to - a stored cost only exists once both halves do, and picking "EUR" on an empty
 * field has to stick until an amount arrives rather than silently doing nothing.
 */
export default function CostInput({ value, isDisabled, className, onChange }: CostInputProps) {
    const [picked, setPicked] = useState(DEFAULT_CURRENCY);
    // A cost saved elsewhere, or discarded, brings its own currency with it
    const currency = value?.currency ?? picked;

    const setCurrency = (next: string) => {
        setPicked(next);
        if (value) {
            onChange({ ...value, currency: next });
        }
    };

    return (
        <NumberInput
            label="Cost"
            placeholder="0.00"
            minValue={0}
            className={classNames("min-w-0", className)}
            isDisabled={isDisabled}
            value={value?.amount ?? NaN}
            onValueChange={(amount) => onChange(isNaN(amount) ? undefined : { amount, currency })}
            formatOptions={{ style: "currency", currency, currencyDisplay: "narrowSymbol" }}
            endContent={
                <Select
                    aria-label="Currency"
                    size="sm"
                    className="w-20 shrink-0"
                    classNames={{ trigger: "h-8 min-h-8 bg-transparent shadow-none px-1", listboxWrapper: "w-20" }}
                    isDisabled={isDisabled}
                    disallowEmptySelection
                    selectedKeys={[currency]}
                    onChange={(event) => setCurrency(event.target.value)}
                >
                    {CURRENCIES.map((code) => (
                        <SelectItem key={code}>{code}</SelectItem>
                    ))}
                </Select>
            }
        />
    );
}

type CostInputProps = {
    value?: IArtworkCost;
    isDisabled?: boolean;
    className?: string;
    onChange: (cost?: IArtworkCost) => void;
};
