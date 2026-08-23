import { ICON_TOKEN, isIconName, walk } from "./format";

// Discord and Github agree on most of markdown, so they share one walk and differ only where they really
// differ: the italic marker, underline, escaping, and how an icon is spelt
export interface MarkdownOptions {
    italic: string;
    underline: { open: string; close: string };
    /** Escapes the metacharacters of the target. Only ever applied to text a user typed */
    escape: (text: string) => string;
    /** How an [icon] token is spelt for this target */
    icon: (name: string) => string;
}

interface ListLevel {
    ordered: boolean;
    index: number;
}

export function toMarkdown(html: string, options: MarkdownOptions) {
    const lists: ListLevel[] = [];
    let quoteDepth = 0;
    let codeDepth = 0;

    // A quote's marker has to lead every line it covers, not just the first
    const prefix = () => (quoteDepth > 0 ? "> ".repeat(quoteDepth) : "");
    const newline = () => `\n${prefix()}`;
    const indent = () => "  ".repeat(Math.max(lists.length - 1, 0));

    const marks: Record<string, string> = {
        b: "**",
        em: options.italic,
        s: "~~",
        code: "`",
        pre: "```"
    };

    const text = (value: string) => {
        // Markdown does not apply inside code, so escaping there would render the backslashes literally
        if (codeDepth > 0) {
            return value;
        }
        // Icons are converted before escaping, or the brackets of a token would be escaped as typed text
        let result = "";
        let last = 0;
        for (const match of value.matchAll(ICON_TOKEN)) {
            const name = match[1].toLowerCase();
            if (!isIconName(name)) {
                continue;
            }
            result += options.escape(value.slice(last, match.index));
            result += options.icon(name);
            last = match.index + match[0].length;
        }
        result += options.escape(value.slice(last));
        // Only the leading line is prefixed by whatever opened the quote; the rest are prefixed here
        return quoteDepth > 0 ? result.replace(/\n/g, newline()) : result;
    };

    return (
        walk(html, {
            text,
            void: () => newline(),
            open: (tag) => {
                switch (tag) {
                    case "u":
                        return options.underline.open;
                    case "h1":
                        return `${newline()}# `;
                    case "h2":
                        return `${newline()}## `;
                    case "h3":
                        return `${newline()}### `;
                    case "blockquote":
                        quoteDepth += 1;
                        return newline();
                    case "ul":
                        lists.push({ ordered: false, index: 0 });
                        return "";
                    case "ol":
                        lists.push({ ordered: true, index: 0 });
                        return "";
                    case "li": {
                        const level = lists[lists.length - 1];
                        if (!level) {
                            return newline();
                        }
                        level.index += 1;
                        const marker = level.ordered ? `${level.index}.` : "-";
                        return `${newline()}${indent()}${marker} `;
                    }
                    case "p":
                        return "";
                    case "code":
                    case "pre":
                        codeDepth += 1;
                        return marks[tag];
                    default:
                        return marks[tag] ?? "";
                }
            },
            close: (tag) => {
                switch (tag) {
                    case "u":
                        return options.underline.close;
                    case "h1":
                    case "h2":
                    case "h3":
                    case "p":
                        return newline();
                    case "blockquote":
                        quoteDepth = Math.max(quoteDepth - 1, 0);
                        return newline();
                    case "ul":
                    case "ol":
                        lists.pop();
                        return lists.length === 0 ? newline() : "";
                    case "li":
                        return "";
                    case "cite":
                        return "";
                    case "code":
                    case "pre":
                        codeDepth = Math.max(codeDepth - 1, 0);
                        return marks[tag];
                    default:
                        return marks[tag] ?? "";
                }
            }
        })
            // A block opening at the very start, or closing at the very end, leaves an edge newline nothing needs
            .replace(/[ \t]+$/gm, "")
            // The last block inside a quote ends its own line, leaving a marker with nothing left to quote
            .replace(/^>+$/gm, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
    );
}

// Escapes `always` anywhere, and a block marker only where it would open a block - so ordinary prose
// keeps its hyphens, hashes and numbering intact
export function escaper(always: string) {
    const anywhere = new RegExp(`[${always.replace(/[\\\]^-]/g, "\\$&")}]`, "g");
    return (text: string) =>
        text
            // First, or the backslashes added below would themselves be escaped
            .replace(/\\/g, "\\\\")
            .replace(anywhere, "\\$&")
            // A marker only opens a block at the head of a line, and only with something following it
            .replace(/(^|\n)([#>+-])(?=\s)/g, "$1\\$2")
            .replace(/(^|\n)(\d+)\./g, "$1$2\\.");
}
