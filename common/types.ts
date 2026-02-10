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
export type SortDirection = 1 | -1 | "asc" | "desc" | "ascending" | "descending";
export type Sortable<T> = EntriesOf<T, SortDirection>;
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