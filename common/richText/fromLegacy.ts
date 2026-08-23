import { decodeEntities, encodeEntities } from "./format";
import { sanitiseHtml } from "./sanitise";

// Which shape a value was written in, stated by the caller since the two cannot always be told apart:
// `cardText` is html spelling bold-italic <i>, `prose` is plain text using ***bold-italic***, "- " and \n
export type LegacyKind = "prose" | "cardText";

/** The line break the old prose used before this format had one of its own */
const LEGACY_BREAK = /<nl\s*\/?>/gi;

/** A break with nothing after it drew no line, and would be a blank one now */
const TRAILING_BREAKS = /(?:<br>\s*)+$/i;

// Card text is never sniffed - a "- " line is a literal bullet there, and marking it up as a list would
// break the round trip back to the pack data. Only prose finishes through the sanitiser, which encodes it
export function fromLegacy(value: string, kind: LegacyKind = "prose") {
    const source = (value ?? "").replace(/\r/g, "");
    if (!source.trim()) {
        return "";
    }
    if (kind === "cardText") {
        return fromLegacyHtml(source);
    }
    // The branch is chosen on the original, or a plain text note ending in the marker reads as markup
    const html = isHtml(source)
        ? source.replace(LEGACY_BREAK, "<br>")
        : fromLegacyText(source.replace(LEGACY_BREAK, "\n"));
    return sanitiseHtml(html).replace(TRAILING_BREAKS, "").trim();
}

/** Anything carrying a tag was written by the old editor, not typed with the prose conventions */
function isHtml(value: string) {
    return /<\/?(?:b|i|em|s|u|br|p|h[1-3]|ul|ol|li|blockquote|code|pre|a|cite)\b[^>]*>/i.test(value);
}

function fromLegacyHtml(html: string) {
    return html
        .replace(/<i>([\s\S]*?)<\/i>/gi, "<b><em>$1</em></b>")
        .replace(/<strong>/gi, "<b>")
        .replace(/<\/strong>/gi, "</b>")
        .replace(/<br\s*\/?>/gi, "<br>")
        .trim();
}

// Decoding before encoding is what makes this correct and repeatable: legacy prose was read as html, so
// `&#34;` was a quote on screen. Encoding first turns it into the literal text `&amp;#34;`, on every pass
function fromLegacyText(text: string) {
    const lines = encodeEntities(decodeEntities(text)).split("\n");
    const output: string[] = [];
    let inList = false;

    for (const line of lines) {
        const bullet = line.match(/^\s*-\s+(.*)$/);
        if (bullet) {
            if (!inList) {
                output.push("<ul>");
                inList = true;
            }
            output.push(`<li>${inline(bullet[1])}</li>`);
            continue;
        }
        if (inList) {
            output.push("</ul>");
            inList = false;
        }
        output.push(inline(line));
    }
    if (inList) {
        output.push("</ul>");
    }

    // Only the lines outside a list are separated by breaks; the list carries its own structure
    return output
        .reduce<string[]>((result, part, index) => {
            const previous = output[index - 1] ?? "";
            const isTag = /^<\/?(?:ul|li)/.test(part);
            const previousIsTag = /^<\/?(?:ul|li)/.test(previous);
            if (index > 0 && !isTag && !previousIsTag) {
                result.push("<br>");
            }
            return result.concat(part);
        }, [])
        .join("")
        .trim();
}

function inline(text: string) {
    return text.replace(/\*\*\*(.+?)\*\*\*/g, "<b><em>$1</em></b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
