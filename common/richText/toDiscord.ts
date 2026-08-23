import { iconNames } from "./format";
import { escaper, toMarkdown } from "./toMarkdown";

export interface DiscordOptions {
    /** Custom emoji markup by icon name, for one guild - see DiscordService.getEmojiMap */
    emojis?: Record<string, string>;
    /** Whether custom emoji can render; a webhook outside the guild cannot, and falls back to the name */
    customEmoji?: boolean;
}

// Underscores included: Discord reads _x_ as italics and __x__ as underline, so snake_case would mangle.
// Text inside <code> is exempt from escaping entirely, so this costs nothing where it would hurt
const escape = escaper("*_~|`[");

// `_` not `*` for italics: `*__~~x~~__*` leaves the italics unrendered, where `___~~x~~___` is the
// underline-italic Discord understands. The cost is that `_` only opens on a word boundary
export function toDiscord(html: string, options: DiscordOptions = {}) {
    const { emojis = {}, customEmoji = true } = options;
    return toMarkdown(html, {
        italic: "_",
        underline: { open: "__", close: "__" },
        escape,
        icon: (name) => (customEmoji ? emojis[name] : undefined) ?? iconNames[name] ?? `[${name}]`
    });
}
