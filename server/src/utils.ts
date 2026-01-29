import { NoteType } from "common/models/cards";
import { IGetResponse } from "./types";

export const NoteVersion: Record<NoteType, "major" | "minor" | "patch" | undefined> = {
    "replaced": "major",
    "reworked": "minor",
    "updated": "patch",
    "implemented": undefined
};

export function generateGetResponse<T>(items: T[], total?: number): IGetResponse<T> {
    return {
        items,
        total: total ?? items.length
    };
}