import { plainLength } from "./toPlain";

// Points at which content can be cut without splitting a marker or orphaning a mark
const BOUNDARY = /<br\s*\/?>|<\/(?:p|li|h[1-3]|blockquote|ul|ol)>/gi;

const MARKS = ["b", "em", "s", "u", "code"];

/** Appends closers for any mark left open by a cut, so the fragment stands on its own */
function repair(html: string) {
    // A cut can land midway through a tag, leaving a fragment nothing will ever close
    const cleaned = html.replace(/<[^>]*$/, "");
    const open: string[] = [];
    for (const match of cleaned.matchAll(/<(\/?)([a-z][a-z0-9]*)(?:[^>]*)>/gi)) {
        const tag = match[2].toLowerCase();
        if (!MARKS.includes(tag)) {
            continue;
        }
        if (match[1]) {
            const index = open.lastIndexOf(tag);
            if (index >= 0) {
                open.splice(index, 1);
            }
        } else {
            open.push(tag);
        }
    }
    return (
        cleaned +
        open
            .reverse()
            .map((tag) => `</${tag}>`)
            .join("")
    );
}

// How long a piece counts as. Readable text by default, but a target adding markers of its own charges
// for those too, so it can measure its own output instead
export type Measure = (html: string) => number;

/** Where to cut so the measured length stays within the limit, preferring a block boundary */
function cutPoint(html: string, limit: number, measure: Measure) {
    let cut = 0;
    for (const match of html.matchAll(BOUNDARY)) {
        const end = match.index + match[0].length;
        if (measure(html.slice(0, end)) > limit) {
            break;
        }
        cut = end;
    }
    if (cut > 0) {
        return cut;
    }
    // A single unbroken block has no boundary to cut on, so it is cut on a word instead
    const rough = html.slice(0, limit);
    const spaced = rough.lastIndexOf(" ");
    return spaced > 0 ? spaced : Math.min(limit, html.length);
}

/** The largest prefix whose measured length fits within `limit`, cut on a block boundary */
export function truncateHtml(html: string, limit: number, measure: Measure = plainLength) {
    if (!html || measure(html) <= limit) {
        return html;
    }
    return repair(html.slice(0, cutPoint(html, limit, measure))).trim();
}

// As many pieces as the limit requires, each cut between blocks - slicing blind would cut a marker in
// half and corrupt everything after it. Exists for a review too long for one Discord embed
export function chunkHtml(html: string, limit: number, measure: Measure = plainLength) {
    const source = html ?? "";
    if (!source || measure(source) <= limit) {
        return [source];
    }

    const chunks: string[] = [];
    let start = 0;
    while (start < source.length) {
        const rest = source.slice(start);
        if (measure(rest) <= limit) {
            chunks.push(repair(rest).trim());
            break;
        }
        const end = cutPoint(rest, limit, measure);
        if (end <= 0) {
            break;
        }
        chunks.push(repair(rest.slice(0, end)).trim());
        start += end;
    }
    return chunks.filter(Boolean);
}
