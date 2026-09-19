import { IDerivedFields, IDerivedKeyword, plotStats, TriggerType } from "../models/cards";
import { toPlain } from "../richText/toPlain";

// Shared with abilityEditorExtensions.tsx's TipTap extension (imports this same constant) - the two
// must never drift, since one governs what's highlighted live, the other what's derived here.
export const ABILITY_TEXT_SOURCE =
    "(?:(?:Forced )?(?:Reaction|Interrupt)|(?:When Revealed)|(?:(?:Plot |Draw |Marshaling |Challenges |Dominance |Standing |Taxation )?Action)):";

const TRIGGER_TYPE_REGEX = new RegExp(`<b>\\s*(${ABILITY_TEXT_SOURCE})\\s*</b>`, "g");

// Mirrors how the card renderer matches modifiers (see Ability in @agot/card-preview) and
// plotModifiers.ts, which imports this rather than keeping its own copy.
const PLOT_MODIFIER_LINE_REGEX = new RegExp(`^(?:\\s*([+-])(\\d+) (${plotStats.join("|")})\\.?\\s*)+$`, "i");

/** A line the card renderer would draw as modifier shapes rather than as ability text */
export function isPlotModifierLine(line: string): boolean {
    return PLOT_MODIFIER_LINE_REGEX.test(line);
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
