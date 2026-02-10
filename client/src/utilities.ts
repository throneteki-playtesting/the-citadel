import { Faction } from "common/models/cards";

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

export function download(url: string, filename: string) {
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