import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faAnglesUp, faArrowRightArrowLeft, faArrowRotateLeft, faGem } from "@fortawesome/free-solid-svg-icons";
import { Faction, NoteType } from "common/models/cards";
import { SemanticVersion, THRONESDB_URL } from "common/utils";
import { valid } from "semver";
import classNames from "classnames";

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

/** Caps a row of children to `max` visible per breakpoint, hiding the rest outright rather than
 *  collapsing to 0 height - `steps` in ascending breakpoint order. */
export function rowCapClasses(steps: { prefix?: string; max: number }[]): string {
    return classNames(
        steps.map(({ prefix, max }, i) => {
            const at = (className: string) => (prefix ? `${prefix}:${className}` : className);
            return classNames(
                i > 0 && at(`[&>*:nth-child(n+${steps[i - 1].max + 1})]:block`),
                i < steps.length - 1 && at(`[&>*:nth-child(n+${max + 1})]:hidden`)
            );
        })
    );
}
