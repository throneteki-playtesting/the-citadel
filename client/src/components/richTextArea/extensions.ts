import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import HardBreak from "@tiptap/extension-hard-break";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Underline from "@tiptap/extension-underline";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import Heading from "@tiptap/extension-heading";
import Blockquote from "@tiptap/extension-blockquote";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { AnyExtension, InputRule, PasteRule } from "@tiptap/core";
import { abilityIcons } from "common/utils";
import { AbilityIcon } from "../cardEditor/components/abilityEditorExtensions";

// Structure over and above the marks and icons every field has. Named individually, not tiered, because
// what suits a field is not a point on a scale. Nothing asks for headings yet; they are here for when one does
export type RichTextFeature = "headings" | "lists" | "quote" | "code";

/** What a field gets when it says nothing: room to structure a paragraph, but not to title one */
export const DEFAULT_FEATURES: RichTextFeature[] = ["lists", "quote", "code"];

// Bold renders <b> rather than tiptap's default <strong>, matching the stored format
const StoredBold = Bold.extend({
    parseHTML: () => [{ tag: "b" }, { tag: "strong" }, { style: "font-weight=700" }],
    renderHTML: () => ["b", 0]
});

// Built from the icons which actually exist, so an unknown name is simply never a match
const ICON_NAMES = Object.keys(abilityIcons).join("|");
const ICON_TYPED = new RegExp(`(?::(${ICON_NAMES}):|\\[(${ICON_NAMES})\\])$`);
const ICON_PASTED = new RegExp(`(?::(${ICON_NAMES}):|\\[(${ICON_NAMES})\\])`, "g");

// Typing or pasting `:martell:`/`[martell]` becomes the icon. Both rules replace the whole match rather
// than using `nodeInputRule`/`nodePasteRule`, which keep a first capture and leave the colons behind

// The insert command places the node itself: rules fire only on typing or pasting, and prose does not load
// the card editor's AutoTextConversions to convert a programmatically inserted token afterwards
const TypedIcon = AbilityIcon.extend({
    addInputRules() {
        const type = this.type;
        return [
            new InputRule({
                find: ICON_TYPED,
                handler: ({ state, range, match }) => {
                    state.tr.replaceWith(range.from, range.to, type.create({ name: match[1] ?? match[2] }));
                }
            })
        ];
    },
    addPasteRules() {
        const type = this.type;
        return [
            new PasteRule({
                find: ICON_PASTED,
                handler: ({ state, range, match }) => {
                    state.tr.replaceWith(range.from, range.to, type.create({ name: match[1] ?? match[2] }));
                }
            })
        ];
    },
    addCommands() {
        return {
            insertThronesIcon:
                (name: string) =>
                ({ commands }) =>
                    commands.insertContent({ type: this.name, attrs: { name } })
        };
    }
});

// Anything every field has. Order matters only for input rules, of which there is one
const baseExtensions = [
    Document,
    Paragraph,
    Text,
    History,
    HardBreak,
    StoredBold,
    Italic,
    Strike,
    Underline,
    TypedIcon
];

const featureExtensions: Record<RichTextFeature, AnyExtension[]> = {
    headings: [Heading.configure({ levels: [1, 2, 3] })],
    lists: [BulletList, OrderedList, ListItem],
    quote: [Blockquote],
    code: [Code, CodeBlock]
};

// A feature works by leaving extensions out rather than hiding buttons: an unloaded extension registers
// no keymap either, so a field offering no heading cannot grow one by chord or by paste
export function extensionsFor(features: RichTextFeature[]) {
    return [...baseExtensions, ...features.flatMap((feature) => featureExtensions[feature] ?? [])];
}
