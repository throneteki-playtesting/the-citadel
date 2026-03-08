export interface IAuditable {
    created: Date,
    updated: Date,
    createdBy: string,
    updatedBy: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAuditable(obj: any): obj is IAuditable {
    const { created, updated, createdBy, updatedBy } = obj;

    return (
        created && created instanceof Date
        && updated && updated instanceof Date
        && createdBy && typeof createdBy === "string"
        && updatedBy && typeof updatedBy === "string"
    );
}