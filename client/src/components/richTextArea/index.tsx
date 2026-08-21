import { Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import classNames from "classnames";
import { plainLength } from "common/richText/toPlain";
import { ICON_TOKEN } from "common/richText/format";
import { abilityIcons } from "common/utils";
import { ICON_SPAN, iconSpan } from "../cardEditor/components/iconHtml";
import { useDeferredCallback } from "../../hooks/useDeferredCallback";
import { DEFAULT_FEATURES, extensionsFor, RichTextFeature } from "./extensions";
import { RichTextToolbar } from "./toolbar";

export type RichTextAreaProps = {
    /** Stored html. See common/richText/format.ts for what the format holds */
    value?: string;
    /** Emits undefined once the editor is empty, so a cleared field is stored as absent rather than "" */
    onValueChange?: (value: string | undefined) => void;
    label?: string;
    /** Serialised into a hidden input, so a form reading FormData still sees this field */
    name?: string;
    placeholder?: string;
    /** Structure offered over and above marks and icons. Defaults to lists, quotes and code */
    features?: RichTextFeature[];
    isDisabled?: boolean;
    isRequired?: boolean;
    isInvalid?: boolean;
    errorMessage?: string;
    /** Counted against the readable text, not the html carrying it */
    maxLength?: number;
    minRows?: number;
    className?: string;
};

// An empty document still serialises as a paragraph, which is not a value anybody meant to store
const EMPTY = /^\s*<p>\s*(<br\s*\/?>)?\s*<\/p>\s*$/i;

/** Tokens become icon nodes on the way in, exactly as they do in the card's ability text */
function toEditorHtml(html: string) {
    return html.replace(ICON_TOKEN, (match, name: string) => (name in abilityIcons ? iconSpan(name) : match));
}

// ...and back to bare tokens on the way out. Storing the span would spell an icon differently to card
// text for no gain, since `[martell]` is already the format's spelling and the pack data's
function fromEditorHtml(html: string) {
    const stripped = html.replace(ICON_SPAN, "[$1]");
    return EMPTY.test(stripped) ? undefined : stripped;
}

const RichTextArea = ({
    value,
    onValueChange,
    label,
    name,
    placeholder,
    features = DEFAULT_FEATURES,
    isDisabled,
    isRequired,
    isInvalid,
    errorMessage,
    maxLength,
    minRows = 3,
    className
}: RichTextAreaProps) => {
    // An inline list is a new array every render, and rebuilding for that drops the document. What the
    // list holds is all the editor and toolbar care about, so that is what is compared
    const featureKey = [...features].sort().join(",");
    const enabled = useMemo(() => featureKey.split(",").filter(Boolean) as RichTextFeature[], [featureKey]);
    const extensions = useMemo(() => extensionsFor(enabled), [enabled]);

    // Built once, so handlers read the latest callback through a ref rather than the one they closed over
    const onValueChangeRef = useRef(onValueChange);
    useEffect(() => {
        onValueChangeRef.current = onValueChange;
    }, [onValueChange]);

    // What this editor last sent upwards, so a keystroke's own echo is recognised without reserialising
    const lastEmitted = useRef(value);
    /** The editor `lastEmitted` was recorded against, so a replacement is not taken at its word */
    const syncedEditor = useRef<Editor | null>(null);

    // Read at flush time rather than handed in, so the serialisation is what gets deferred - a held key
    // otherwise pays for a full document walk per repeat
    const editorRef = useRef<Editor | null>(null);
    const { schedule, flush } = useDeferredCallback(() => {
        const editor = editorRef.current;
        if (!editor || editor.isDestroyed) {
            return;
        }
        const html = fromEditorHtml(editor.getHTML());
        // Only a change is worth reporting: mounting dispatches transactions of its own (twice, under
        // StrictMode), and reporting one as an edit hands the field an empty document
        if (html === lastEmitted.current) {
            return;
        }
        lastEmitted.current = html;
        onValueChangeRef.current?.(html);
    });

    const editor = useEditor(
        {
            extensions,
            content: toEditorHtml(value ?? ""),
            editable: !isDisabled,
            onUpdate: schedule,
            // Nothing may read a stale value once the caret has left, and a click on Save blurs first
            onBlur: flush,
            editorProps: {
                attributes: {
                    class: classNames(
                        "focus:outline-none p-2 max-w-none",
                        // The stored format leans on <b><em> for bold-italic, so <em> keeps its weight
                        "[&_em]:italic [&_b]:font-bold [&_u]:underline [&_s]:line-through",
                        "[&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-large [&_h2]:font-bold [&_h3]:font-bold",
                        "[&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6",
                        "[&_blockquote]:border-s-2 [&_blockquote]:border-default-400 [&_blockquote]:ps-3",
                        "[&_code]:bg-default-200 [&_code]:rounded [&_code]:px-1",
                        "[&_pre]:bg-default-200 [&_pre]:rounded [&_pre]:p-2"
                    ),
                    style: `min-height: ${minRows * 1.5 + 1}rem`
                }
            }
        },
        [extensions]
    );

    // Looks empty, which is not the same as holding no text: an empty bullet is still something on
    // screen, and a placeholder behind it reads as a second line. Only an untouched paragraph counts
    const isVisuallyEmpty = useEditorState({
        editor,
        selector: ({ editor }) => {
            const doc = editor?.state.doc;
            const first = doc?.firstChild;
            return !!doc && doc.childCount === 1 && first?.type.name === "paragraph" && first.content.size === 0;
        }
    });

    useEffect(() => {
        editorRef.current = editor ?? null;
    }, [editor]);

    useEffect(() => {
        if (!editor) {
            return;
        }
        editor.setEditable(!isDisabled);

        // `lastEmitted` describes one editor's document, so a replacement (a feature change rebuilds it)
        // starts owing the value again rather than inheriting a record of what its predecessor received
        const isSynced = syncedEditor.current === editor;
        syncedEditor.current = editor;
        if (isSynced && value === lastEmitted.current) {
            return;
        }
        // Only while unfocused, so an external change can never yank the document out from under the caret
        if (!isSynced || !editor.isFocused) {
            lastEmitted.current = value;
            editor.commands.setContent(toEditorHtml(value ?? ""), { emitUpdate: false });
        }
    }, [editor, isDisabled, value]);

    const length = useMemo(() => (maxLength ? plainLength(value ?? "") : 0), [maxLength, value]);

    if (!editor) {
        return null;
    }

    const overLimit = !!maxLength && length > maxLength;

    return (
        <div className={classNames("flex flex-col gap-1 w-full", className)}>
            {label && (
                <label className="text-small text-foreground-600">
                    {label}
                    {isRequired && <span className="text-danger ms-0.5">*</span>}
                </label>
            )}
            <div
                className={classNames("flex flex-col rounded-xl overflow-hidden bg-default-100 border-2", {
                    "border-danger": isInvalid || overLimit,
                    "border-transparent": !isInvalid && !overLimit,
                    "opacity-disabled pointer-events-none": isDisabled
                })}
            >
                <RichTextToolbar editor={editor} features={enabled} isDisabled={isDisabled} />
                <div className="relative grow">
                    {placeholder && isVisuallyEmpty && (
                        <span className="pointer-events-none absolute top-2 start-2 text-foreground-400 text-small">
                            {placeholder}
                        </span>
                    )}
                    <EditorContent editor={editor} className="grow" />
                </div>
            </div>
            <div className="flex justify-between gap-2 text-tiny">
                <span className="text-danger">{isInvalid ? errorMessage : ""}</span>
                {maxLength && (
                    <span className={classNames("shrink-0", overLimit ? "text-danger" : "text-foreground-500")}>
                        {length}/{maxLength}
                    </span>
                )}
            </div>
            {name && <input type="hidden" name={name} value={value ?? ""} />}
        </div>
    );
};

export default RichTextArea;
