import { ICard, Type } from "../models/cards";
import { BLOCK_TAGS, ICON_TOKEN, walk } from "../richText/format";

/** Deliberately simple and detached from the card preview's actual rendered font size - tune here. */
export const TEXT_BOX_LINE_WEIGHTS = {
    charsPerLine: {
        character: 50,
        attachment: 50,
        event: 50,
        agenda: 50,
        location: 40,
        plot: 70
    } as Record<Type, number>,
    acceptableLines: {
        character: 7,
        attachment: 7,
        event: 7,
        agenda: 7,
        location: 7,
        plot: 4
    } as Record<Type, number>,
    // Plot stat modifiers render as a fixed row of badges, not wrapped text - a flat, one-time cost
    // for the whole card, not per stat and not per line they were written across
    plotModifierRows: 2,
    // A forced break costs slightly more than a plain wrapped line, since it abandons whatever space
    // was left on the row it closes
    forcedBreakLines: 1.15,
    iconCharWidth: 2
};

const ICON_PLACEHOLDER = "-".repeat(TEXT_BOX_LINE_WEIGHTS.iconCharWidth);

const PLOT_MODIFIER_LINE = /^(?:\s*[+-]\d+\s*(?:Income|Initiative|Claim|Reserve)\.?\s*)+$/i;

interface AbilityTextSegment {
    length: number;
    isPlotModifierLine: boolean;
}

// Splits ability text into the pieces that force a new printed line - paragraphs, list items and
// hard breaks, spelled as either a <br> tag or a literal "\n"
function segmentAbilityText(html: string): AbilityTextSegment[] {
    const segments: AbilityTextSegment[] = [];
    let plainText = "";

    const flush = () => {
        if (plainText.length > 0) {
            segments.push({ length: plainText.length, isPlotModifierLine: PLOT_MODIFIER_LINE.test(plainText.trim()) });
        }
        plainText = "";
    };

    walk(html ?? "", {
        text: (value) => {
            const stripped = value.replace(ICON_TOKEN, ICON_PLACEHOLDER);
            const lines = stripped.split("\n");
            lines.forEach((line, index) => {
                plainText += line;
                if (index < lines.length - 1) {
                    flush();
                }
            });
            return "";
        },
        open: () => "",
        close: (tag) => {
            if ((BLOCK_TAGS as readonly string[]).includes(tag)) {
                flush();
            }
            return "";
        },
        void: () => {
            flush();
            return "";
        }
    });
    flush();

    return segments;
}

// Each segment always starts a fresh row, so its own row count is just its length divided evenly
// across charsPerLine; forcedBreakLines is the cost of one break above the bare 1 a wrap would cost
function fillRows(segmentLengths: number[], charsPerLine: number): number {
    if (segmentLengths.length === 0) {
        return 0;
    }
    const wrappedLines = segmentLengths.reduce((total, length) => total + Math.ceil(length / charsPerLine), 0);
    const breakCount = segmentLengths.length - 1;
    return wrappedLines + breakCount * (TEXT_BOX_LINE_WEIGHTS.forcedBreakLines - 1);
}

export function computeTextBoxLines(card: Pick<ICard, "type" | "text" | "designer">): number {
    const charsPerLine = TEXT_BOX_LINE_WEIGHTS.charsPerLine[card.type];

    let hasPlotModifiers = false;
    const textSegmentLengths: number[] = [];
    for (const segment of segmentAbilityText(card.text)) {
        if (segment.isPlotModifierLine) {
            hasPlotModifiers = true;
        } else {
            textSegmentLengths.push(segment.length);
        }
    }
    if (card.designer) {
        textSegmentLengths.push(card.designer.length);
    }

    const lines = fillRows(textSegmentLengths, charsPerLine);
    return lines + (hasPlotModifiers ? TEXT_BOX_LINE_WEIGHTS.plotModifierRows : 0);
}
