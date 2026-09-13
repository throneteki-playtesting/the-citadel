import { IDerivedFields, IDerivedKeyword, plotStats, TriggerType } from "../models/cards";
import { toPlain } from "../richText/toPlain";

// Shared with abilityEditorExtensions.tsx's TipTap extension (imports this same constant) - the two
// must never drift, since one governs what's highlighted live, the other what's derived here.
export const ABILITY_TEXT_SOURCE =
    "(?:(?:Forced )?(?:Reaction|Interrupt)|(?:When Revealed)|(?:(?:Plot |Draw |Marshaling |Challenges |Dominance |Standing |Taxation )?Action)):";

const TRIGGER_TYPE_REGEX = new RegExp(`<b>\\s*(${ABILITY_TEXT_SOURCE})\\s*</b>`, "g");
// Anchored to a line's own start, unlike TRIGGER_TYPE_REGEX above - used to ask "is this
// particular line a triggered-ability line" rather than "does the text contain one anywhere"
const TRIGGER_LINE_REGEX = new RegExp(`^<b>\\s*(?:${ABILITY_TEXT_SOURCE})\\s*</b>`);

// Mirrors how the card renderer matches modifiers (see Ability in @agot/card-preview) and
// plotModifiers.ts, which imports this rather than keeping its own copy.
const PLOT_MODIFIER_LINE_REGEX = new RegExp(`^(?:\\s*([+-])(\\d+) (${plotStats.join("|")})\\.?\\s*)+$`, "i");

/** A line the card renderer would draw as modifier shapes rather than as ability text */
export function isPlotModifierLine(line: string): boolean {
    return PLOT_MODIFIER_LINE_REGEX.test(line);
}

/** True only when a line is entirely keyword declarations with nothing left over once stripped - not
 *  merely a line that mentions a keyword-sounding word in passing. */
function isPureKeywordLine(line: string): boolean {
    let stripped = line;
    for (const { regex } of KEYWORD_PATTERNS) {
        const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
        stripped = stripped.replace(global, "");
    }
    return stripped.replace(/[.,\s]+/g, "").length === 0;
}

interface KeywordPattern {
    keyword: string;
    regex: RegExp;
}

// (X) keywords capture their numeric parameter; "No attachments" captures the "except {trait}" suffix
const KEYWORD_PATTERNS: KeywordPattern[] = [
    { keyword: "Ambush", regex: /\bAmbush\s*\((\d+)\)/i },
    { keyword: "Assault", regex: /\bAssault\b/i },
    { keyword: "Bestow", regex: /\bBestow\s*\((\d+)\)/i },
    { keyword: "Insight", regex: /\bInsight\b/i },
    { keyword: "Intimidate", regex: /\bIntimidate\b/i },
    { keyword: "Limited", regex: /\bLimited\b/i },
    { keyword: "No attachments", regex: /\bNo attachments(?: except ([\w\s]+?))?\b/i },
    { keyword: "Pillage", regex: /\bPillage\b/i },
    { keyword: "Prized", regex: /\bPrized\b/i },
    { keyword: "Renown", regex: /\bRenown\b/i },
    { keyword: "Shadow", regex: /\bShadow\s*\((\d+)\)/i },
    { keyword: "Stealth", regex: /\bStealth\b/i },
    { keyword: "Terminal", regex: /\bTerminal\b/i }
];

/** Derives read-only fields from a card's ability text - called server-side on every suggestion
 *  save; `derived` is never accepted from a client payload. */
export function deriveFields(cardTextHtml: string): IDerivedFields {
    const triggerTypes: TriggerType[] = [];
    for (const match of cardTextHtml.matchAll(TRIGGER_TYPE_REGEX)) {
        triggerTypes.push(match[1] as TriggerType);
    }

    const plainText = toPlain(cardTextHtml ?? "");
    const [firstLine = ""] = plainText.split("\n");

    const keywords: IDerivedKeyword[] = [];
    for (const { keyword, regex } of KEYWORD_PATTERNS) {
        const match = regex.exec(firstLine);
        if (!match) {
            continue;
        }
        const captured = match[1];
        keywords.push(
            captured !== undefined
                ? { keyword, value: /^\d+$/.test(captured) ? Number(captured) : captured }
                : { keyword }
        );
    }

    return { triggerTypes, keywords };
}

/** Deliberately not `TRIGGER_TYPE_REGEX.test(...)` directly - `.test()` on a shared global-flagged
 *  regex mutates `lastIndex` between calls, wrongly missing matches on repeated calls. */
export function hasTriggeredAbility(cardTextHtml: string): boolean {
    return deriveFields(cardTextHtml).triggerTypes.length > 0;
}

/** True when a line survives after the first-row keyword and trailing plot-modifier line (if
 *  present) are set aside, and it isn't itself a triggered-ability line - a static, always-on effect. */
export function hasPassiveAbility(cardTextHtml: string): boolean {
    const html = cardTextHtml ?? "";
    const rawLines = html.split("\n");
    const plainLines = toPlain(html).split("\n");

    return rawLines.some((rawLine, index) => {
        const plainLine = plainLines[index] ?? "";
        if (!plainLine.trim()) {
            return false;
        }
        if (index === 0 && isPureKeywordLine(plainLine)) {
            return false;
        }
        if (index === rawLines.length - 1 && isPlotModifierLine(plainLine)) {
            return false;
        }
        return !TRIGGER_LINE_REGEX.test(rawLine);
    });
}
