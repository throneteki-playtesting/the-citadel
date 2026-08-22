// How a thrones icon is written, on both sides of an editor. Its own module because both editors translate
// with string replaces rather than through the schema, so the node and each editor all need these shapes

// [name] is the stored format's spelling, :name: the one people type
const ICON_SOURCE = "(?::([a-zA-Z0-9_]+):|\\[([a-zA-Z0-9_]+)\\])";

/** One token, for the match a plugin is already looking at */
export const ICON_REGEX = new RegExp(ICON_SOURCE);

/** Every token in a run of text, for translating a whole document at once */
export const ICON_TOKENS = new RegExp(ICON_SOURCE, "g");

/** The node's html spelling, as a pattern and as a builder, so neither end writes the shape out again */
export const ICON_SPAN = /<span[^>]*data-thrones-icon="(\w+)"[^>]*>[^<]*<\/span>/g;
export const iconSpan = (name: string) => `<span data-thrones-icon="${name}">[${name}]</span>`;
