import { UUID } from "crypto";
import { Regex } from "./utils";

export type EntriesOf<T, V = unknown> = {
    [K in keyof T]?: T[K] extends (infer U)[]
        ? EntriesOf<U> | V
        : T[K] extends object
            ? EntriesOf<T[K]> | V
            : V;
}
export type DeepPartial<T> =
    T extends (infer U)[]
        ? DeepPartial<U>[] | undefined
        : T extends object
            ? { [P in keyof T]?: DeepPartial<T[P]> }
            : T;

type Primitive = string | number | boolean;

type ComparableOperators<T> =
    [NonNullable<T>] extends [string]
        ? { $gt?: T; $gte?: T; $lt?: T; $lte?: T; $ne?: T; $in?: T[]; $nin?: T[]; $regex?: string; $exists?: boolean }
        : [NonNullable<T>] extends [number]
            ? { $gt?: T; $gte?: T; $lt?: T; $lte?: T; $ne?: T; $in?: T[]; $nin?: T[]; $exists?: boolean }
            : [NonNullable<T>] extends [Date]
                ? {
                    $gt?: string | Date; $gte?: string | Date;
                    $lt?: string | Date; $lte?: string | Date;
                    $ne?: string | Date;
                    $in?: (string | Date)[]; $nin?: (string | Date)[];
                    $exists?: boolean;
                  }
                : { $exists?: boolean };

export type Filter<T> =
    [NonNullable<T>] extends [Date]
        ? T | ComparableOperators<T>
        : [NonNullable<T>] extends [Primitive]
            ? T | ComparableOperators<T>
            : NonNullable<T> extends (infer U)[]
                ? Filter<U>[] | undefined
                : NonNullable<T> extends object
                    ? { [P in keyof NonNullable<T>]?: Filter<NonNullable<T>[P]> | ComparableOperators<NonNullable<T>[P]> }
                    : T | ComparableOperators<T>;

const OPERATOR_KEYS = new Set(["$gt", "$gte", "$lt", "$lte", "$ne", "$in", "$nin", "$regex", "$exists"]);
export function isOperatorObject(value: unknown): value is Record<string, unknown> {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        Object.keys(value).every(k => OPERATOR_KEYS.has(k))
    );
}

export type SortDirection = "asc" | "desc";
export type Sort<T> = EntriesOf<T, SortDirection>;

export type Filterable<T> = {
    [K in keyof T]?: T[K] extends Array<infer U>
        ? Iterable<U> | U | undefined
        : T[K] extends ReadonlyArray<infer U>
            ? Iterable<U> | U | undefined
            : T[K] extends object
                ? Filterable<T[K]> | undefined
                : Iterable<T[K]> | T[K] | undefined;
};
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