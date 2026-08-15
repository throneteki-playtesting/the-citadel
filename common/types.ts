import { UUID } from "./models/shared";
import { Regex } from "./utils";
import { NoteType } from "./models/cards";

export type EntriesOf<T, V = unknown> = {
    [K in keyof T]?: T[K] extends (infer U)[] ? EntriesOf<U> | V : T[K] extends object ? EntriesOf<T[K]> | V : V;
};
export type DeepPartial<T> = T extends (infer U)[]
    ? DeepPartial<U>[] | undefined
    : T extends object
      ? { [P in keyof T]?: DeepPartial<T[P]> }
      : T;

type Primitive = string | number | boolean;

type ComparableOperators<T> = [NonNullable<T>] extends [string]
    ? { $gt?: T; $gte?: T; $lt?: T; $lte?: T; $ne?: T; $in?: T[]; $nin?: T[]; $regex?: string; $exists?: boolean }
    : [NonNullable<T>] extends [number]
      ? { $gt?: T; $gte?: T; $lt?: T; $lte?: T; $ne?: T; $in?: T[]; $nin?: T[]; $exists?: boolean }
      : [NonNullable<T>] extends [Date]
        ? {
              $gt?: string | Date;
              $gte?: string | Date;
              $lt?: string | Date;
              $lte?: string | Date;
              $ne?: string | Date;
              $in?: (string | Date)[];
              $nin?: (string | Date)[];
              $exists?: boolean;
          }
        : { $exists?: boolean };

export type Filter<T> = [NonNullable<T>] extends [Date]
    ? T | ComparableOperators<T>
    : [NonNullable<T>] extends [Primitive]
      ? T | ComparableOperators<T>
      : NonNullable<T> extends (infer U)[]
        ? Filter<U>[] | undefined
        : NonNullable<T> extends object
          ? { [P in keyof NonNullable<T>]?: Filter<NonNullable<T>[P]> | ComparableOperators<NonNullable<T>[P]> }
          : T | ComparableOperators<T>;

type ExplodableValue<T> = [NonNullable<T>] extends [Date]
    ? T | ComparableOperators<T>
    : [NonNullable<T>] extends [Primitive]
      ? T | T[] | ComparableOperators<T>
      : NonNullable<T> extends (infer U)[]
        ? Filter<U>[] | undefined
        : NonNullable<T> extends object
          ? Explodable<NonNullable<T>>
          : T | ComparableOperators<T>;

export type Explodable<T extends object> = {
    [K in keyof T]?: ExplodableValue<T[K]>;
};

const OPERATOR_KEYS = new Set(["$gt", "$gte", "$lt", "$lte", "$ne", "$in", "$nin", "$regex", "$exists"]);
export function isOperatorObject(value: unknown): value is Record<string, unknown> {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        Object.keys(value).every((k) => OPERATOR_KEYS.has(k))
    );
}
export function isIterable(v: unknown): v is Iterable<unknown> {
    return (
        v != null &&
        typeof v !== "string" &&
        typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
    );
}

// Evaluates an already-exploded Filter<T> against a real in-memory object - the counterpart to
// buildFilterQuery, which instead turns a Filter<T> into a MongoDB query for the database to evaluate.
export function matchesFilter<T>(item: T, filter: Filter<T>): boolean {
    return matchesValue(item, filter);
}

function matchesValue(value: unknown, filter: unknown): boolean {
    if (filter === undefined) {
        return true;
    }
    if (filter instanceof Date) {
        const comparable = value instanceof Date ? value : new Date(value as string);
        return comparable.getTime() === filter.getTime();
    }
    if (filter === null || typeof filter !== "object") {
        return value === filter;
    }
    if (isOperatorObject(filter)) {
        return matchesOperators(value, filter);
    }
    return Object.entries(filter as Record<string, unknown>).every(([key, nested]) =>
        matchesValue((value as Record<string, unknown> | null | undefined)?.[key], nested)
    );
}

function compareValues(value: unknown, operand: unknown): number {
    if (value instanceof Date || operand instanceof Date) {
        return new Date(value as string | Date).getTime() - new Date(operand as string | Date).getTime();
    }
    if (typeof value === "number" && typeof operand === "number") {
        return value - operand;
    }
    if (typeof value === "string" && typeof operand === "string") {
        return value.localeCompare(operand);
    }
    return NaN;
}

function matchesIn(value: unknown, operands: unknown[]): boolean {
    return isIterable(value) ? Array.from(value).some((v) => operands.includes(v)) : operands.includes(value);
}

function matchesRegex(value: unknown, pattern: string): boolean {
    if (typeof value !== "string") {
        return false;
    }
    // Mongo's PCRE engine supports inline "(?i)" flags; JS RegExp doesn't, so translate it
    const caseInsensitive = pattern.startsWith("(?i)");
    const source = caseInsensitive ? pattern.slice(4) : pattern;
    return new RegExp(source, caseInsensitive ? "i" : undefined).test(value);
}

function matchesOperators(value: unknown, operators: Record<string, unknown>): boolean {
    for (const [operator, operand] of Object.entries(operators)) {
        switch (operator) {
            case "$gt":
                if (!(compareValues(value, operand) > 0)) return false;
                break;
            case "$gte":
                if (!(compareValues(value, operand) >= 0)) return false;
                break;
            case "$lt":
                if (!(compareValues(value, operand) < 0)) return false;
                break;
            case "$lte":
                if (!(compareValues(value, operand) <= 0)) return false;
                break;
            case "$ne":
                if (value === operand) return false;
                break;
            case "$in":
                if (!matchesIn(value, operand as unknown[])) return false;
                break;
            case "$nin":
                if (matchesIn(value, operand as unknown[])) return false;
                break;
            case "$regex":
                if (!matchesRegex(value, operand as string)) return false;
                break;
            case "$exists":
                if ((value !== undefined) !== operand) return false;
                break;
        }
    }
    return true;
}

export type SortDirection = "asc" | "desc";
export type Sort<T> = EntriesOf<T, SortDirection>;

export type SingleOrArray<T> = T | T[];

export type DeckLink = `https://thronesdb.com/deck/view/${UUID}`;
export type DecklistLink = `https://thronesdb.com/decklist/view/${number}/${string}`;
export function isDeckLink(url: string): url is DeckLink {
    return Regex.ThronesDB.DeckLink.test(url);
}
export function isDecklistLink(url: string): url is DecklistLink {
    return Regex.ThronesDB.DeckListLink.test(url);
}
export function isThronesDbLink(url: string): url is DeckLink | DecklistLink {
    return isDeckLink(url) || isDecklistLink(url);
}

export type ISO8601String = `${number}-${number}-${number}T${number}:${number}:${number}.${number}Z`;

export type ChangeType = NoteType | "new" | "draft" | "preview";
