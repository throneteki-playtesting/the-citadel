import { Filter, isOperatorObject, SingleOrArray, Explodable } from "common/types";
import { useMemo } from "react";

function isIterable(v: unknown): v is Iterable<unknown> {
    return (
        v != null &&
        typeof v !== "string" &&
        typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
    );
}

function cartesianProduct(obj: Filter<object>): Record<string, unknown>[] | undefined {
    const worker = (input: unknown): Record<string, unknown>[] | undefined => {
        if (input == null || typeof input !== "object") return undefined;

        if (isOperatorObject(input)) return [input as Record<string, unknown>];

        const entries = Object.entries(input as Record<string, unknown>).filter(([, v]) => {
            if (v == null) return false;
            if (isOperatorObject(v)) return true;
            if (isIterable(v)) return Array.from(v as Iterable<unknown>).length > 0;
            if (typeof v !== "object") return true;
            return worker(v) !== undefined;
        });

        if (entries.length === 0) return undefined;

        return entries.reduce<Record<string, unknown>[]>((acc, [key, v]) => {
            if (isOperatorObject(v)) {
                return acc.map(item => ({ ...item, [key]: v }));
            }

            if (isIterable(v)) {
                const values = Array.from(v as Iterable<unknown>);
                return acc.flatMap(item => values.map(val => ({ ...item, [key]: val })));
            }

            if (typeof v !== "object") {
                return acc.map(item => ({ ...item, [key]: v }));
            }

            const nested = worker(v);
            if (!nested) return acc;
            return acc.flatMap(item => nested.map(n => ({ ...item, [key]: n })));
        }, [{}]);
    };

    return worker(obj);
}

export default function useFilter<T extends object>(
    filter?: SingleOrArray<Explodable<T>>
): Filter<T>[] | undefined {
    return useMemo(() => {
        if (!filter) return undefined;

        if (Array.isArray(filter)) {
            const results = filter.flatMap(f => cartesianProduct(f as Filter<object>) ?? [{}]);
            return results as Filter<T>[];
        }

        return (cartesianProduct(filter as Filter<object>) ?? [{}]) as Filter<T>[];
    }, [filter]);
}

