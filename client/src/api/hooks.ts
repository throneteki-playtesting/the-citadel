import { useMemo } from "react";
import { Filterable } from "common/types";

export function useFilter<T>(filter?: Filterable<T>) {
    return useMemo(() => {
        if (!filter) {
            return filter;
        }
        function cartesianProduct(obj: Filterable<T>): Record<string, unknown>[] | undefined {
            // Type-guard for iterables (arrays, sets, etc.) without using `any`.
            const isIterable = (v: unknown): v is Iterable<unknown> =>
                v != null && typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function";

            // Recursive worker that accepts unknown to avoid unsafe casts in the public signature.
            const worker = (input: unknown): Record<string, unknown>[] | undefined => {
                if (input == null || typeof input !== "object") return undefined;

                // Keep only entries that have non-empty iterable values, scalar values, or nested non-empty objects
                const entries = Object.entries(input as Record<string, unknown>).filter(([, v]) => {
                    if (v == null) return false;
                    if (isIterable(v) && typeof v !== "string") return Array.from(v as Iterable<unknown>).length > 0;
                    if (typeof v !== "object") return true; // scalar single value (treat as single-item iterable)
                    return typeof v === "object" && worker(v) !== undefined;
                });

                if (entries.length === 0) return undefined;

                // Reduce entries into the cartesian product
                return entries.reduce<Record<string, unknown>[]>((acc, [key, v]) => {
                    if (isIterable(v) && typeof v !== "string") {
                        const values = Array.from(v as Iterable<unknown>);
                        return acc.flatMap(item => values.map(val => ({ ...item, [key]: val })));
                    }

                    if (typeof v !== "object") {
                        return acc.map(item => ({ ...item, [key]: v }));
                    }

                    const nested = worker(v);
                    return acc.flatMap(item => (nested ?? []).map(n => ({ ...item, [key]: n })));
                }, [{}]);
            };

            return worker(obj);
        }

        return cartesianProduct(filter);
    }, [filter]);
}

export const useTimezone = () => {
    const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

    const format = (date: Date, options?: Intl.DateTimeFormatOptions) => {
        return date.toLocaleString(navigator.language, {
            timeZone: timezone,
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            ...options
        });
    };

    return { timezone, format };
};