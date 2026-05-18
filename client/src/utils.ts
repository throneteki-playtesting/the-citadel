import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faAnglesUp, faArrowRightArrowLeft, faArrowRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { Faction, NoteType } from "common/models/cards";

export function enumToArray<T extends { [key: string]: string | number }>(
    e: T
): { key: T[keyof T]; value: Extract<keyof T, string> }[] {
    return Object.keys(e)
        .filter(k => isNaN(Number(k)))
        .map(k => ({
            key: e[k as keyof T],
            value: k as Extract<keyof T, string>
        }));
}

export function downloadBlob(blob: Blob, fallbackFilename?: string): void {
    const filename = fallbackFilename ?? crypto.randomUUID();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function parseParamNumber(param?: string) {
    if (!param) {
        return undefined;
    }
    const parsed = parseInt(param);
    return isNaN(parsed) ? undefined : parsed;
}

export function getFactionCardImage(faction: Faction) {
    return `https://thronesdb.com/images/factions/${faction}.png`;
}

export const noteTypeIcon: Record<NoteType, IconDefinition> = {
    updated: faAnglesUp,
    reworked: faArrowRotateLeft,
    replaced: faArrowRightArrowLeft
};

export function daysFromNow(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
}