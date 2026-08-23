import { iconNames } from "./format";
import { escaper, toMarkdown } from "./toMarkdown";

// Angle brackets included: Github renders raw HTML, so an unescaped < would be read as a tag
const escape = escaper("*_~`[]<>|");

// Github cannot reach the guild's custom emoji, so an icon reads as its name - the same wording Discord
// falls back to, so the two never describe one card differently
export function toGithub(html: string) {
    return toMarkdown(html, {
        italic: "_",
        underline: { open: "<ins>", close: "</ins>" },
        escape,
        icon: (name) => iconNames[name] ?? `[${name}]`
    });
}
