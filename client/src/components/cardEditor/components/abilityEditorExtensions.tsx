import { Extension, Mark, mergeAttributes, Node } from "@tiptap/core";
import HardBreak from "@tiptap/extension-hard-break";
import { abilityIcons } from "common/utils";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";

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
    parseHTML: () => [{ tag: "b" }],
    renderHTML: ({ HTMLAttributes }) => ["b", HTMLAttributes, 0],
    addCommands: () => ({
        toggleTriggeredAbility:
            () =>
                ({ commands }) => {
                    commands.unsetMark("trait");
                    return commands.toggleMark("triggeredAbility");
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
                if (!nodeBefore?.isText) return false;

                if (nodeBefore.marks.some((m) => m.type.name === "triggeredAbility")) {
                    const tr = state.tr
                        .removeMark($from.start(), $from.end(), state.schema.marks.triggeredAbility)
                        .setMeta(markRemovedKey, "triggeredAbility");
                    this.editor.view.dispatch(tr);
                    return true;
                }

                return false;
            }
        };
    }
});

const ABILITY_TEXT_REGEX = /^((?:(?:Forced )?(?:Reaction|Interrupt)|(?:When Revealed)|(?:(?:Plot |Draw |Marshaling |Challenges |Dominance |Standing |Taxation )?Action)):)/;
const TRAIT_HIGHLIGHT_REGEX = /\*\*\*(.+?)\*\*\*/;
const ICON_REGEX = /(?::([a-zA-Z0-9_]+):|\[([a-zA-Z0-9_]+)\])/;

const autoConvertKey = new PluginKey("autoTextConversions");
const markRemovedKey = new PluginKey("markRemoved");

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

                const allAreHistory = docChangedTrs.every(
                    (t) => t.getMeta("addToHistory") === false
                );
                if (allAreHistory) return null;

                const removedMarkName: string | null = transactions.reduce<string | null>(
                    (acc, t) => acc ?? t.getMeta(markRemovedKey) ?? null,
                    null
                );

                const { tr } = newState;
                let modified = false;

                const { trait, triggeredAbility } = newState.schema.marks;
                const thronesIconType = newState.schema.nodes.thronesIcon;

                newState.doc.descendants((node, pos) => {

                    if (!node.isText) return;

                    const text = node.text || "";

                    type PendingReplacement = {
                        start: number;
                        end: number;
                        apply: () => void;
                    };
                    const pending: PendingReplacement[] = [];

                    const collect = (
                        pattern: RegExp,
                        handler: (match: RegExpExecArray, start: number, end: number) => void
                    ) => {
                        const re = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
                        let match: RegExpExecArray | null;
                        while ((match = re.exec(text)) !== null) {
                            const start = pos + match.index;
                            const end = start + match[0].length;

                            const m = match;
                            const s = start;
                            const e = end;
                            pending.push({ start: s, end: e, apply: () => handler(m, s, e) });
                        }
                    };

                    collect(TRAIT_HIGHLIGHT_REGEX, (match, start, end) => {
                        const innerText = match[1];

                        if (node.marks.some((m) => m.type === trait)) return;
                        if (removedMarkName === "trait") return;
                        tr.replaceRangeWith(start, end, newState.schema.text(innerText, [trait.create()]));
                        tr.removeStoredMark(trait);
                        modified = true;
                    });

                    collect(ABILITY_TEXT_REGEX, (match, start, end) => {
                        const innerText = match[1];

                        if (node.marks.some((m) => m.type === triggeredAbility)) return;
                        if (removedMarkName === "triggeredAbility") return;
                        tr.replaceRangeWith(
                            start,
                            end,
                            newState.schema.text(innerText, [triggeredAbility.create()])
                        );
                        tr.removeStoredMark(triggeredAbility);
                        modified = true;
                    });

                    collect(ICON_REGEX, (match, start, end) => {
                        const iconName = match[1] || match[2];
                        if (abilityIcons[iconName]) {
                            tr.replaceRangeWith(start, end, thronesIconType.create({ name: iconName }));
                            modified = true;
                        }
                    });

                    pending.sort((a, b) => b.start - a.start);
                    for (const p of pending) {
                        p.apply();
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
    addOptions: () => ({ HTMLAttributes: { class: "italics" } }),
    parseHTML: () => [{ tag: "i" }],
    renderHTML: ({ HTMLAttributes }) => [
        "i",
        mergeAttributes(HTMLAttributes, { style: "font-weight: 700" }),
        0
    ],
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
    renderHTML: ({ node }) => [
        "span",
        { "data-thrones-icon": node.attrs.name },
        `[${node.attrs.name}]`
    ],
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
                ({ state, dispatch, view }) => {
                    const { schema } = state;
                    const node = schema.nodes.thronesIcon.create({ name });

                    const insertPos = view.state.selection.from;
                    const baseTr = view.state.tr;
                    const insert = baseTr
                        .insert(insertPos, node)
                        .setSelection(
                            TextSelection.near(
                                baseTr.doc.resolve(insertPos + node.nodeSize)
                            )
                        );
                    if (dispatch) dispatch(insert);
                    return true;
                }
    })
});

export const NewLine = HardBreak.extend({
    addKeyboardShortcuts() {
        return { Enter: () => this.editor.commands.setHardBreak() };
    }
});