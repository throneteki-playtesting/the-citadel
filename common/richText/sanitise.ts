import { encodeEntities, VOID_TAGS, walk } from "./format";

// Rewrites html as only what the format allows, at the boundary rather than on read - so a reader which
// forgets to sanitise has nothing to be caught out by. Legacy spellings normalise on the way through
export function sanitiseHtml(html: string) {
    if (!html) {
        return "";
    }
    return walk(html, {
        text: (value) => encodeEntities(value),
        void: (tag) => `<${tag}>`,
        open: (tag) => `<${tag}>`,
        close: (tag) => ((VOID_TAGS as readonly string[]).includes(tag) ? "" : `</${tag}>`)
    });
}
