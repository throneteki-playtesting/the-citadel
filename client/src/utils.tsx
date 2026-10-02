import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faAnglesUp, faArrowRightArrowLeft, faArrowRotateLeft, faGem } from "@fortawesome/free-solid-svg-icons";
import { Faction, NoteType } from "common/models/cards";
import { SemanticVersion, THRONESDB_URL } from "common/utils";
import { valid } from "semver";
import { VERTICAL_CARD_WIDTH_REM } from "./constants";

/** Simple ordered-subsequence match - lets "bounce" find an option whose label never says "bounce".
 *  Shared by SearchTagPicker and the suggestion settings reward/punishment search. */
export function fuzzyMatch(text: string, query: string) {
    const t = text.toLowerCase();
    const q = query.toLowerCase().trim();
    if (!q) {
        return true;
    }
    let ti = 0;
    for (const c of q) {
        if (c === " ") {
            continue;
        }
        ti = t.indexOf(c, ti);
        if (ti === -1) {
            return false;
        }
        ti++;
    }
    return true;
}

/** Strips a leading http(s):// (or protocol-relative //) and any leading/trailing slashes, for display. */
export function stripUrlProtocol(url: string): string {
    return url.replace(/^(?:https?:)?\/\/+/i, "").replace(/\/+$/, "");
}

/** A short buzz confirming a long-press, where the device has one. Browsers refuse vibration until the page has
 *  had a completed tap, which a first-ever long-press hasn't - still held down - so that one goes without. */
export function hapticTap() {
    if (navigator.userActivation?.hasBeenActive) {
        navigator.vibrate?.(10);
    }
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

const listFormat = new Intl.ListFormat("en-GB", { type: "conjunction" });

// "A, B and C" as its pieces, so each item can be drawn as more than plain text
export function formatListParts(items: string[]) {
    return listFormat.formatToParts(items);
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

// A plot is a vertical card's footprint transposed - as wide as one is tall, rather than squeezed
export function cardThumbnailWidthRem(isPlot: boolean, widthRem = VERTICAL_CARD_WIDTH_REM) {
    return isPlot ? (widthRem * 333) / 240 : widthRem;
}
