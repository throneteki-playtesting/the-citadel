// Three shapes flavor text can take, distinguished by punctuation alone: plain prose, a quote from
// someone else ("..." - Person), and a quote from the card's own character (just "...")
export type FlavorKind = "passage" | "person" | "self";

const PERSON_QUOTE = /^"([\s\S]*)"\s*-\s*(.+)$/;
const SELF_QUOTE = /^"([\s\S]*)"$/;

export type ParsedFlavor = { kind: FlavorKind; text: string; person: string };

export function parseFlavor(raw?: string): ParsedFlavor {
    if (!raw) {
        return { kind: "passage", text: "", person: "" };
    }
    const personMatch = raw.match(PERSON_QUOTE);
    if (personMatch) {
        return { kind: "person", text: personMatch[1], person: personMatch[2].trim() };
    }
    const selfMatch = raw.match(SELF_QUOTE);
    if (selfMatch) {
        return { kind: "self", text: selfMatch[1], person: "" };
    }
    return { kind: "passage", text: raw, person: "" };
}

// A person may or may not have typed the surrounding quote marks themselves - either is fine, this just
// makes sure exactly one pair ends up in the saved text rather than none or two
function withQuotes(text: string): string {
    const bare = text.startsWith('"') && text.endsWith('"') && text.length >= 2 ? text.slice(1, -1) : text;
    return `"${bare}"`;
}

export function serialiseFlavor(kind: FlavorKind, text: string, person: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed) {
        return undefined;
    }
    if (kind === "person") {
        return person.trim() ? `${withQuotes(trimmed)} - ${person.trim()}` : withQuotes(trimmed);
    }
    if (kind === "self") {
        return withQuotes(trimmed);
    }
    return trimmed;
}

// Advisory only - a passage is meant to be plain prose, not something that already reads as a quote
export function flavorTextIssue(kind: FlavorKind, text: string): string | undefined {
    if (kind === "passage" && text.includes('"')) {
        return "Narration cannot contain quotations";
    }
    return undefined;
}
