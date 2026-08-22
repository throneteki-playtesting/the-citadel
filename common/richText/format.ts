import { factionNames } from "../utils";

// The one statement of the format - a tag gained or lost here changes every converter at once. Bold-italic
// is <b><em>, never a tag of its own; <i> parses (legacy, and the pack dialect) but is never written
export const MARK_TAGS = ["b", "em", "s", "u", "code", "cite"] as const;
export const BLOCK_TAGS = ["p", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "pre"] as const;
export const VOID_TAGS = ["br"] as const;

export type MarkTag = (typeof MARK_TAGS)[number];

export const ALLOWED_TAGS: readonly string[] = [...MARK_TAGS, ...BLOCK_TAGS, ...VOID_TAGS];

/** Legacy spellings accepted on parse, mapped to what they mean now. <i> was bold-italic throughout */
export const LEGACY_TAGS: Record<string, MarkTag[]> = {
    i: ["b", "em"],
    strong: ["b"],
    strike: ["s"],
    del: ["s"],
    ins: ["u"]
};

/** Icons store as [name], the pack data's own spelling, so card text and prose share one vocabulary */
export const ICON_TOKEN = /\[([a-z0-9_]+)\]/gi;

/** Readable names, used wherever the target cannot render a custom emoji */
export const iconNames: Record<string, string> = {
    ...factionNames,
    military: "Military",
    intrigue: "Intrigue",
    power: "Power",
    unique: "Unique"
};

export function isIconName(name: string) {
    return name.toLowerCase() in iconNames;
}

// A tag or a run of text, so a converter can tell generated markup from what a user typed. A lone `<`
// falls to the text branch: opening no tag, it is a character somebody typed and must be escaped as one
const TOKEN = /<(\/?)([a-z][a-z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+|<)/gi;

export interface Handlers {
    /** A run of text the user typed. Escaping belongs here, and nowhere else */
    text: (value: string) => string;
    open: (tag: string) => string;
    close: (tag: string) => string;
    void: (tag: string) => string;
}

// Walks the html once, handing generated markup and user text to separate handlers. Only `text` escapes,
// so an emitted marker is never escaped by mistake; an unknown tag is dropped rather than passed through
export function walk(html: string, handlers: Handlers) {
    return (html ?? "").replace(TOKEN, (_match, closing: string, tag: string, _attrs: string, text: string) => {
        if (text !== undefined) {
            return handlers.text(decodeEntities(text));
        }
        const name = tag.toLowerCase();
        if ((VOID_TAGS as readonly string[]).includes(name)) {
            return handlers.void(name);
        }
        const legacy = LEGACY_TAGS[name];
        if (legacy) {
            // Closers run in reverse, or <i> would expand to <b><em> ... </b></em> and nest wrongly
            return closing
                ? [...legacy].reverse().map(handlers.close).join("")
                : legacy.map((mapped) => handlers.open(mapped)).join("");
        }
        if (!ALLOWED_TAGS.includes(name)) {
            return "";
        }
        return closing ? handlers.close(name) : handlers.open(name);
    });
}

const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
};

// Numeric references decode too: older records carry `&#34;` for a quote, and leaving it alone would put
// five visible characters into a Discord message
export function decodeEntities(text: string) {
    return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, body: string) => {
        if (body[0] !== "#") {
            return ENTITIES[body.toLowerCase()] ?? entity;
        }
        const hex = body[1] === "x" || body[1] === "X";
        const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    });
}

export function encodeEntities(text: string) {
    return text.replace(/[&<>]/g, (character) => `&${{ "&": "amp", "<": "lt", ">": "gt" }[character]};`);
}
