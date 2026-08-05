import { PlotStat, plotStats } from "common/models/cards";
import { titleCase } from "common/utils";
import { PluginKey, Transaction } from "prosemirror-state";

export type PlotModifiers = Partial<Record<PlotStat, number>>;

/** Value a modifier starts at when toggled on */
export const DEFAULT_PLOT_MODIFIER = 1;
const MAX_PLOT_MODIFIER = 9;

// Mirrors how the card renderer itself matches modifiers (see Ability in @agot/card-preview): case
// insensitive, the trailing full stop optional, and any amount of whitespace around each one. A line the
// renderer would draw as shapes must be one this captures, or the two would disagree about what is text.
const PLOT_MODIFIER_PATTERN = `\\s*([+-])(\\d+) (${plotStats.join("|")})\\.?\\s*`;
const PLOT_MODIFIER_REGEX = new RegExp(PLOT_MODIFIER_PATTERN, "gi");
const PLOT_MODIFIER_LINE_REGEX = new RegExp(`^(?:${PLOT_MODIFIER_PATTERN})+$`, "i");

export function formatPlotModifier(value: number) {
    return `${value > 0 ? "+" : ""}${value}`;
}

/** A line the card renderer would draw as modifier shapes rather than as ability text */
export function isPlotModifierLine(line: string) {
    return PLOT_MODIFIER_LINE_REGEX.test(line);
}

export function parsePlotModifiers(line: string): PlotModifiers {
    const modifiers: PlotModifiers = {};
    for (const [, sign, value, name] of line.matchAll(PLOT_MODIFIER_REGEX)) {
        modifiers[name.toLowerCase() as PlotStat] = parseInt(`${sign}${value}`);
    }
    return modifiers;
}

/** Lifts every line of plot modifiers out of the card text, leaving the remainder as the editable body */
export function splitPlotModifiers(text?: string): { body: string; modifiers: PlotModifiers } {
    const body: string[] = [];
    const modifiers: PlotModifiers = {};

    for (const line of text?.split("\n") ?? []) {
        if (isPlotModifierLine(line)) {
            // Later lines win, so a freshly typed modifier overrides one already set
            Object.assign(modifiers, parsePlotModifiers(line));
        } else {
            body.push(line);
        }
    }

    return { body: body.join("\n"), modifiers };
}

/** Reattaches the modifiers as the card text's trailing line, always in printed stat order */
export function joinPlotModifiers(body: string, modifiers: PlotModifiers) {
    const line = plotStats
        .filter((stat) => modifiers[stat] !== undefined)
        .map((stat) => `${formatPlotModifier(modifiers[stat]!)} ${titleCase(stat)}.`)
        .join(" ");

    if (!line) {
        return body || undefined;
    }
    return body ? `${body}\n${line}` : line;
}

/** Steps a modifier by one, stepping over zero so a card can never print a "+0" modifier */
export function stepPlotModifier(value: number, direction: 1 | -1) {
    const stepped = value + direction === 0 ? direction : value + direction;
    return Math.max(-MAX_PLOT_MODIFIER, Math.min(MAX_PLOT_MODIFIER, stepped));
}

/** Doubles as the meta key PlotModifierCapture tags its transaction with */
export const plotModifierCaptureKey = new PluginKey<PlotModifiers>("plotModifierCapture");

/** Collects whatever PlotModifierCapture lifted out of the document over the transactions of one update */
export function getCapturedPlotModifiers(transactions: readonly Transaction[]): PlotModifiers {
    return transactions.reduce<PlotModifiers>(
        (captured, transaction) => Object.assign(captured, transaction.getMeta(plotModifierCaptureKey)),
        {}
    );
}
