import { Editor, EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { BaseElementProps } from "../../../types";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef } from "react";
import { Icon } from "../../thronesIcon";
import { AbilityToolbar } from "./abilityToolbar";
import {
    AbilityIcon,
    AutoTextConversions,
    NewLine,
    PlotModifierCapture,
    Trait,
    TriggeredAbility
} from "./abilityEditorExtensions";
import { ICON_SPAN, ICON_TOKENS, iconSpan } from "./iconHtml";
import {
    DEFAULT_PLOT_MODIFIER,
    getCapturedPlotModifiers,
    joinPlotModifiers,
    PlotModifiers,
    splitPlotModifiers
} from "./plotModifiers";
import { PlotModifierChips } from "./plotModifierChips";
import classNames from "classnames";
import { abilityIcons } from "common/utils";
import { PlotStat, plotStats } from "common/models/cards";
import { useDeferredCallback } from "../../../hooks/useDeferredCallback";

// A trait stores as `<b><em>` but is `<i>` in this editor, where the two tags are not styling but two
// exclusive meanings. Translating at the edge keeps that second vocabulary in the one component needing it
function convertIncomingText(text?: string) {
    return (
        text
            ?.replace(/<b>\s*<em>([\s\S]*?)<\/em>\s*<\/b>/gi, "<i>$1</i>")
            .replace(/\n/g, "<br>")
            .replace(ICON_TOKENS, (match, colonName, bracketName) => {
                const name = colonName || bracketName;
                return abilityIcons[name] ? iconSpan(name) : match;
            }) ?? ""
    );
}

function convertOutgoingHtml(html: string) {
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(ICON_SPAN, "[$1]")
        .replace(/<i>([\s\S]*?)<\/i>/gi, "<b><em>$1</em></b>");
}

const TextDocument = Document.extend({
    content: "inline*",
    marks: "_"
});

export const AbilityEditor = ({
    value: text,
    setValue: setText,
    isDisabled,
    errorMessage
}: AbilityTextEditorProps<string>) => {
    // Modifiers are managed by the chip row rather than the editor, so they are kept out of the document
    // entirely and reattached as the text's trailing line
    const { body, modifiers } = useMemo(() => splitPlotModifiers(text), [text]);

    // The editor is built once, so anything its handlers need is read through a ref rather than captured
    // from the render which happened to create it
    const bodyRef = useRef(body);
    const modifiersRef = useRef(modifiers);
    const setTextRef = useRef(setText);
    useEffect(() => {
        bodyRef.current = body;
        modifiersRef.current = modifiers;
        setTextRef.current = setText;
    }, [body, modifiers, setText]);

    // What this editor last sent upwards; comparing against it recognises a keystroke's own echo without
    // serialising the whole document again to find out
    const lastEmitted = useRef(body);

    // Modifiers captured out of the document while the emit was still pending, so a burst which both types
    // and captures still reports both
    const capturedRef = useRef<PlotModifiers>({});
    // The editor is read at flush time rather than handed in, so the serialisation itself is what gets
    // deferred - a held key otherwise pays for a full document walk, and a card preview redraw, per repeat
    const editorRef = useRef<Editor | null>(null);
    const { schedule, flush } = useDeferredCallback(() => {
        const editor = editorRef.current;
        if (!editor || editor.isDestroyed) {
            return;
        }
        const outgoing = convertOutgoingHtml(editor.getHTML());
        const captured = capturedRef.current;
        // Only a change is worth reporting: mounting dispatches transactions of its own (twice, under
        // StrictMode), and reporting one as an edit hands the field an empty document
        if (outgoing === lastEmitted.current && Object.keys(captured).length === 0) {
            return;
        }
        capturedRef.current = {};
        lastEmitted.current = outgoing;
        setTextRef.current(joinPlotModifiers(outgoing, { ...modifiersRef.current, ...captured }));
    });

    const editor = useEditor({
        extensions: [
            TextDocument,
            Text,
            TriggeredAbility,
            AutoTextConversions,
            Trait,
            AbilityIcon,
            PlotModifierCapture,
            NewLine,
            History
        ],
        content: convertIncomingText(body),
        onUpdate({ transaction, appendedTransactions }) {
            // Typing tags the appended transaction, pasting tags the root one; either overrides that chip
            Object.assign(capturedRef.current, getCapturedPlotModifiers([transaction, ...appendedTransactions]));
            schedule();
        },
        // Nothing may read a stale value once the caret has left, and a click on Save blurs first
        onBlur: flush,
        editorProps: {
            attributes: {
                class: "whitespace-pre-wrap min-h-[6.5rem] focus:outline-none p-2 [&_i]:font-bold"
            }
        }
    });

    const setModifiers = useCallback((modifiers: PlotModifiers) => {
        setTextRef.current(joinPlotModifiers(bodyRef.current, modifiers));
    }, []);

    const togglePlotModifier = useCallback(
        (stat: PlotStat) => {
            const current = modifiersRef.current;
            const { [stat]: existing, ...remaining } = current;
            setModifiers(existing === undefined ? { ...current, [stat]: DEFAULT_PLOT_MODIFIER } : remaining);
        },
        [setModifiers]
    );

    const toggleTrait = useCallback(() => editor?.chain().focus().toggleTrait().run(), [editor]);
    const insertIcon = useCallback((icon: Icon) => editor?.chain().focus().insertThronesIcon(icon).run(), [editor]);

    // A primitive, so the memoised toolbar is not rebuilt every time the modifiers object is recreated
    const activeStats = plotStats.filter((stat) => modifiers[stat] !== undefined).join(",");

    useEffect(() => {
        editorRef.current = editor ?? null;
    }, [editor]);

    useEffect(() => {
        if (!editor) {
            return;
        }
        if (typeof isDisabled !== "undefined") {
            editor.setEditable(!isDisabled);
        }
        // Our own echo coming back around; the document already says this
        if (body === lastEmitted.current) {
            return;
        }
        // Only while unfocused, so an external change can never yank the document out from under the caret
        if (!editor.isFocused) {
            lastEmitted.current = body;
            // Not an edit, so it must not travel back out as one
            editor.commands.setContent(convertIncomingText(body), { emitUpdate: false });
        }
    }, [body, editor, isDisabled]);

    return (
        <div
            className={classNames("flex flex-col bg-default-100 rounded-xl overflow-hidden", {
                "bg-blend-darken": isDisabled
            })}
        >
            {editor && (
                <AbilityToolbar
                    editor={editor}
                    isDisabled={isDisabled}
                    activeStats={activeStats}
                    onToggleTrait={toggleTrait}
                    onInsertIcon={insertIcon}
                    onTogglePlotModifier={togglePlotModifier}
                />
            )}
            <EditorContent editor={editor} className="grow" />
            <PlotModifierChips value={modifiers} setValue={setModifiers} isDisabled={isDisabled} />
            {errorMessage && <div className="text-tiny text-danger">{errorMessage}</div>}
        </div>
    );
};

type AbilityTextEditorProps<T> = Omit<BaseElementProps, "children"> & {
    value?: T;
    setValue: Dispatch<SetStateAction<T | undefined>>;
    isDisabled?: boolean;
    errorMessage?: string;
};

export default AbilityEditor;
