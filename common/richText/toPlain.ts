import { ICON_TOKEN, iconNames, isIconName, walk } from "./format";

// The words in the html - what a length limit counts and a search matches. Icons read as their name,
// which is what somebody typing into a search box means
export function toPlain(html: string) {
    return walk(html, {
        text: (value) =>
            value.replace(ICON_TOKEN, (token, name: string) => {
                const key = name.toLowerCase();
                return isIconName(key) ? iconNames[key] : token;
            }),
        void: () => "\n",
        open: (tag) => (tag === "li" ? "\n" : ""),
        close: (tag) => (["p", "h1", "h2", "h3", "blockquote", "ul", "ol"].includes(tag) ? "\n" : "")
    })
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** How long this content actually reads as, ignoring the markup carrying it */
export function plainLength(html: string) {
    return toPlain(html).length;
}
