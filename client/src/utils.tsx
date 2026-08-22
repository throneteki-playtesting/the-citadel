import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faAnglesUp, faArrowRightArrowLeft, faArrowRotateLeft, faGem } from "@fortawesome/free-solid-svg-icons";
import { Faction, NoteType } from "common/models/cards";
import { SemanticVersion, THRONESDB_URL } from "common/utils";
import { valid } from "semver";

/** Strips a leading http(s):// for display. */
export function stripUrlProtocol(url: string): string {
    return url.replace(/^https?:\/\//i, "");
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

export function parseParamNumber(param?: string | null) {
    if (!param) {
        return undefined;
    }
    const parsed = parseInt(param);
    return isNaN(parsed) ? undefined : parsed;
}
export function parseParamSemanticVersion(param?: string) {
    if (!param) {
        return undefined;
    }
    return (valid(param) ?? undefined) as SemanticVersion | undefined;
}

export function getFactionCardImage(faction: Faction) {
    return `${THRONESDB_URL}/images/factions/${faction}.png`;
}

export const noteTypeIcon: Record<NoteType, IconDefinition> = {
    updated: faAnglesUp,
    reworked: faArrowRotateLeft,
    replaced: faArrowRightArrowLeft,
    refinement: faGem
};

export function daysFromNow(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
}

export function formatCurrency(amount: number, currency: string, options?: Intl.NumberFormatOptions) {
    return Intl.NumberFormat(navigator.language, {
        style: "currency",
        currency,
        // "symbol" gives "US$50" where the money fields show "$50" - the same cost has to read the same way
        currencyDisplay: "narrowSymbol",
        ...options
    }).format(amount);
}
