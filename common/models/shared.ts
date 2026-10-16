import { isEqual, omit } from "lodash-es";

export type ReleaseDate = `${number}-${number}-${number}`;

export type UUID = `${string}-${string}-${string}-${string}-${string}`;

export interface IAuditable {
    created: Date;
    updated: Date;
    createdBy: string;
    updatedBy: string;
    _metadata?: Record<string, unknown>;
}

// The fields auditing sets, rather than whoever wrote the record
export const AUDIT_FIELDS = ["_metadata", "created", "createdBy", "updated", "updatedBy"] as const;

// Whether two records say the same thing, apart from their auditing and any other fields to leave out
export const hasSameContent = (a: object, b: object, ignoring: string[] = []) =>
    isEqual(omit(a, [...AUDIT_FIELDS, ...ignoring]), omit(b, [...AUDIT_FIELDS, ...ignoring]));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAuditable(obj: any): obj is IAuditable {
    const { created, updated, createdBy, updatedBy } = obj;

    return (
        created &&
        created instanceof Date &&
        updated &&
        updated instanceof Date &&
        createdBy &&
        typeof createdBy === "string" &&
        updatedBy &&
        typeof updatedBy === "string"
    );
}
