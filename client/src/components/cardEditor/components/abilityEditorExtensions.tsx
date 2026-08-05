import { Extension, Mark, Node } from "@tiptap/core";
import HardBreak from "@tiptap/extension-hard-break";
import { abilityIcons } from "common/utils";
import { isPlotModifierLine, parsePlotModifiers, plotModifierCaptureKey, PlotModifiers } from "./plotModifiers";
import { Fragment, MarkType, Node as ProseMirrorNode, Schema, Slice } from "prosemirror-model";
import { Plugin, PluginKey, Transaction } from "prosemirror-state";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        trait: {
            toggleTrait: () => ReturnType;
        };
        triggeredAbility: {
            toggleTriggeredAbility: () => ReturnType;
        };
        thronesIcon: {
            insertThronesIcon: (name: string) => ReturnType;
        };
    }
}

export const TriggeredAbility = Mark.create({
    name: "triggeredAbility",
    // Typing at either edge of the mark must not extend it; the mark is owned by AutoTextConversions,
    // which keeps it aligned to exactly the ABILITY_TEXT_REGEX match
    inclusive: false,
    parseHTML: () => [{ tag: "b" }],
    renderHTML: ({ HTMLAttributes }) => ["b", HTMLAttributes, 0],
    addCommands: () => ({
        toggleTriggeredAbility:
            () =>
            ({ commands }) => {
                commands.unsetMark("trait");
                return commands.toggleMark("triggeredAbility");
            }
    })
});

const ABILITY_TEXT_SOURCE =
    "(?:(?:Forced )?(?:Reaction|Interrupt)|(?:When Revealed)|(?:(?:Plot |Draw |Marshaling |Challenges |Dominance |Standing |Taxation )?Action)):";
const ABILITY_TEXT_REGEX = new RegExp(`^(${ABILITY_TEXT_SOURCE})`);
// Markdown bolding arriving by paste; the lookarounds keep it off a ***trait*** wrapper's inner asterisks
const BOLD_ABILITY_TEXT_REGEX = new RegExp(`(?<!\\*)\\*\\*(${ABILITY_TEXT_SOURCE})\\*\\*(?!\\*)`);
const TRAIT_HIGHLIGHT_REGEX = /\*\*\*(.+?)\*\*\*/;
const ICON_REGEX = /(?::([a-zA-Z0-9_]+):|\[([a-zA-Z0-9_]+)\])/;

const autoConvertKey = new PluginKey("autoTextConversions");
const markRemovedKey = new PluginKey("markRemoved");
const pastedNewLinesKey = new PluginKey("pastedNewLines");

/** Stands in for inline nodes which carry no text (icons, hard breaks), so line text stays position-accurate */
const NON_TEXT_PLACEHOLDER = "￼";

type EditorLine = { start: number; end: number; text: string };

/** Splits the document (a single inline block) into the lines separated by its hard breaks */
function getLines(doc: ProseMirrorNode): EditorLine[] {
    const lines: EditorLine[] = [];
    let line: EditorLine = { start: 0, end: 0, text: "" };

    doc.forEach((node, offset) => {
        if (node.type.name === "hardBreak") {
            lines.push(line);
            line = { start: offset + node.nodeSize, end: offset + node.nodeSize, text: "" };
            return;
        }
        line.end = offset + node.nodeSize;
        line.text += node.isText ? (node.text ?? "") : NON_TEXT_PLACEHOLDER;
    });
    lines.push(line);

    return lines;
}

/** Turns plain text into inline content, keeping its line breaks as the hard breaks this document uses */
function createInlineSlice(schema: Schema, text: string) {
    const content = text
        .split(/\r\n?|\n/)
        .flatMap((line, index) => [
            ...(index > 0 ? [schema.nodes.hardBreak.create()] : []),
            ...(line ? [schema.text(line)] : [])
        ]);
    return new Slice(Fragment.from(content), 0, 0);
}

function isRangeFullyMarked(doc: ProseMirrorNode, from: number, to: number, type: MarkType) {
    let fullyMarked = true;
    doc.nodesBetween(from, to, (node) => {
        if (node.isText && !type.isInSet(node.marks)) {
            fullyMarked = false;
        }
    });
    return fullyMarked;
}

/**
 * Keeps the triggered ability mark aligned to exactly the prefix each line currently matches, adding it once
 * the prefix is complete and dropping it again the moment the prefix is broken. Marks never shift positions,
 * so this stays valid for any replacements applied to the same transaction afterwards.
 */
function reconcileTriggeredAbility(tr: Transaction, doc: ProseMirrorNode, type: MarkType) {
    let modified = false;

    for (const line of getLines(doc)) {
        const match = ABILITY_TEXT_REGEX.exec(line.text);
        const markEnd = match ? line.start + match[1].length : line.start;

        if (match && !isRangeFullyMarked(doc, line.start, markEnd, type)) {
            tr.addMark(line.start, markEnd, type.create());
            modified = true;
        }
        if (markEnd < line.end && doc.rangeHasMark(markEnd, line.end, type)) {
            tr.removeMark(markEnd, line.end, type);
            modified = true;
        }
    }

    return modified;
}

type TextReplacement = { start: number; end: number; apply: () => void };

/**
 * Gathers every match of `pattern` within a text node as a deferred replacement. Nothing is applied here
 * because overlapping and earlier replacements would shift the positions of those still to come.
 */
function collectReplacements(
    text: string,
    pos: number,
    pattern: RegExp,
    apply: (match: RegExpExecArray, start: number, end: number) => void
): TextReplacement[] {
    const regex = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
    const replacements: TextReplacement[] = [];

    let next: RegExpExecArray | null;
    while ((next = regex.exec(text)) !== null) {
        // Bound per iteration; the loop variable itself is null by the time these run
        const match = next;
        const start = pos + match.index;
        const end = start + match[0].length;
        replacements.push({ start, end, apply: () => apply(match, start, end) });
    }

    return replacements;
}

export const AutoTextConversions = Extension.create({
    name: "autoTextConversions",

    addProseMirrorPlugins: () => [
        new Plugin({
            key: autoConvertKey,
            appendTransaction: (transactions, _oldState, newState) => {
                const isOurs = transactions.some((t) => t.getMeta(autoConvertKey));
                if (isOurs) return null;

                const docChangedTrs = transactions.filter((t) => t.docChanged);
                if (docChangedTrs.length === 0) return null;

                const allAreHistory = docChangedTrs.every((t) => t.getMeta("addToHistory") === false);
                if (allAreHistory) return null;

                const removedMarkName: string | null = transactions.reduce<string | null>(
                    (acc, t) => acc ?? t.getMeta(markRemovedKey) ?? null,
                    null
                );

                const { tr, schema } = newState;
                const { trait, triggeredAbility } = newState.schema.marks;
                const thronesIconType = schema.nodes.thronesIcon;

                let modified = reconcileTriggeredAbility(tr, newState.doc, triggeredAbility);

                newState.doc.descendants((node, pos) => {
                    if (!node.isText) return;

                    const text = node.text ?? "";
                    const replacements = [
                        ...collectReplacements(text, pos, TRAIT_HIGHLIGHT_REGEX, (match, start, end) => {
                            if (node.marks.some((m) => m.type === trait)) return;
                            if (removedMarkName === "trait") return;
                            tr.replaceRangeWith(start, end, schema.text(match[1], [trait.create()]));
                            tr.removeStoredMark(trait);
                            modified = true;
                        }),
                        // The mark is applied here rather than left to the reconcile pass, which has already
                        // run against the doc as it was before these asterisks were stripped
                        ...collectReplacements(text, pos, BOLD_ABILITY_TEXT_REGEX, (match, start, end) => {
                            tr.replaceRangeWith(start, end, schema.text(match[1], [triggeredAbility.create()]));
                            modified = true;
                        }),
                        ...collectReplacements(text, pos, ICON_REGEX, (match, start, end) => {
                            const iconName = match[1] || match[2];
                            if (!abilityIcons[iconName]) return;
                            tr.replaceRangeWith(start, end, thronesIconType.create({ name: iconName }));
                            modified = true;
                        })
                    ];

                    // Descending, so each replacement leaves the positions of those still to come intact
                    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
                        replacement.apply();
                    }
                });

                if (!modified) return null;

                tr.setMeta(autoConvertKey, true);
                tr.setMeta("addToHistory", false);
                return tr;
            }
        })
    ]
});

export const Trait = Mark.create({
    name: "trait",
    parseHTML: () => [{ tag: "i" }],
    renderHTML: ({ HTMLAttributes }) => ["i", HTMLAttributes, 0],
    addCommands: () => ({
        toggleTrait:
            () =>
            ({ commands }) => {
                commands.unsetMark("triggeredAbility");
                return commands.toggleMark("trait");
            }
    }),

    addKeyboardShortcuts() {
        return {
            Backspace: () => {
                const { state } = this.editor;
                const { selection, doc } = state;

                if (!selection.empty) return false;

                const { $from } = selection;
                const before = $from.pos - 1;
                if (before < 0) return false;

                const nodeBefore = doc.nodeAt(before);
                if (!nodeBefore || !nodeBefore.isText) return false;

                if (nodeBefore.marks.some((m) => m.type.name === "trait")) {
                    const tr = state.tr
                        .removeMark($from.start(), $from.end(), state.schema.marks.trait)
                        .setMeta(markRemovedKey, "trait");
                    this.editor.view.dispatch(tr);
                    return true;
                }

                return false;
            }
        };
    }
});

export const AbilityIcon = Node.create({
    name: "thronesIcon",
    group: "inline",
    inline: true,

    atom: true,
    addAttributes: () => ({ name: { default: null } }),
    parseHTML: () => [
        {
            tag: "span[data-thrones-icon]",
            getAttrs: (dom) => ({
                name: (dom as HTMLElement).getAttribute("data-thrones-icon")
            })
        }
    ],
    renderHTML: ({ node }) => ["span", { "data-thrones-icon": node.attrs.name }, `[${node.attrs.name}]`],
    addNodeView:
        () =>
        ({ node }) => {
            const span = document.createElement("span");
            span.className = "font-thronesdb";
            span.textContent = abilityIcons[node.attrs.name] ?? `[${node.attrs.name}]`;
            span.setAttribute("data-thrones-icon", node.attrs.name);

            return { dom: span };
        },
    addCommands: () => ({
        insertThronesIcon:
            (name: string) =>
            ({ commands }) =>
                commands.insertContent(`[${name}]`)
    })
});

/**
 * Plot modifiers belong to the chip row, not the document, so any line the user types (or pastes) which the
 * card renderer would draw as modifier shapes is lifted straight back out. Its values travel to the chip row
 * on the meta of the very transaction that removed them.
 */
export const PlotModifierCapture = Extension.create({
    name: "plotModifierCapture",

    addProseMirrorPlugins: () => [
        new Plugin({
            key: plotModifierCaptureKey,
            appendTransaction: (transactions, _oldState, newState) => {
                if (!transactions.some((t) => t.docChanged)) {
                    return null;
                }

                const lines = getLines(newState.doc).filter((line) => isPlotModifierLine(line.text));
                if (lines.length === 0) {
                    return null;
                }

                // Document order, so a modifier repeated further down wins
                const captured: PlotModifiers = {};
                for (const line of lines) {
                    Object.assign(captured, parsePlotModifiers(line.text));
                }

                const { tr } = newState;
                // Descending, so each deletion leaves the positions of the lines still to remove intact
                for (const line of [...lines].reverse()) {
                    // Take the hard break on either side of the line with it, so no blank line is left behind
                    const from = line.start > 0 ? line.start - 1 : line.start;
                    const to = line.start === 0 && line.end < newState.doc.content.size ? line.end + 1 : line.end;
                    tr.delete(from, to);
                }

                return tr.setMeta(plotModifierCaptureKey, captured);
            },

            props: {
                // A pasted modifier merging into a line of ability text would never be a line of its own for
                // appendTransaction to find, so the clipboard's modifiers are consumed before they land
                handlePaste: (view, event) => {
                    const text = event.clipboardData?.getData("text/plain");
                    if (!text) {
                        return false;
                    }

                    const captured: PlotModifiers = {};
                    const remaining: string[] = [];
                    for (const line of text.split(/\r\n?|\n/)) {
                        if (isPlotModifierLine(line)) {
                            Object.assign(captured, parsePlotModifiers(line));
                        } else {
                            remaining.push(line);
                        }
                    }

                    // Nothing to consume, so let the normal paste handling deal with it
                    if (Object.keys(captured).length === 0) {
                        return false;
                    }

                    const { tr, schema } = view.state;
                    view.dispatch(
                        tr
                            .replaceSelection(createInlineSlice(schema, remaining.join("\n")))
                            .setMeta(plotModifierCaptureKey, captured)
                    );
                    return true;
                }
            }
        })
    ]
});

export const NewLine = HardBreak.extend({
    addKeyboardShortcuts() {
        return { Enter: () => this.editor.commands.setHardBreak() };
    },

    // The document holds inline content only, so pasted line breaks have no block structure to survive in and
    // would otherwise be flattened into one long line. Both clipboard flavours are remapped onto hard breaks.
    addProseMirrorPlugins: () => [
        new Plugin({
            key: pastedNewLinesKey,
            props: {
                clipboardTextParser: (text, _context, _plain, view) => createInlineSlice(view.state.schema, text),
                transformPastedHTML: (html) =>
                    html.replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "<br>").replace(/(?:<br\s*\/?>)+$/i, "")
            }
        })
    ]
});
