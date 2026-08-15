export type NumericOperator = "eq" | "lt" | "gt";
export type NumericFilterValue = { operator: NumericOperator; value: number };

// The caller's field may be typed as a union (eg. "X" | number) that breaks a strict
// ComparableOperators<number> shape - callers needing that should cast at the call site.
export function numericOperators(value?: NumericFilterValue): number | { $lt: number } | { $gt: number } | undefined {
    if (!value) {
        return undefined;
    }
    switch (value.operator) {
        case "eq":
            return value.value;
        case "lt":
            return { $lt: value.value };
        case "gt":
            return { $gt: value.value };
    }
}

export function decodeNumericOperators(value: unknown): NumericFilterValue | undefined {
    if (typeof value === "number") {
        return { operator: "eq", value };
    }
    if (value && typeof value === "object") {
        const operators = value as { $lt?: number; $gt?: number };
        if (typeof operators.$lt === "number") {
            return { operator: "lt", value: operators.$lt };
        }
        if (typeof operators.$gt === "number") {
            return { operator: "gt", value: operators.$gt };
        }
    }
    return undefined;
}
