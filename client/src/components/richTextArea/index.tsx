import { Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFormValidationState } from "@react-stately/form";
import classNames from "classnames";
import { plainLength } from "common/richText/toPlain";
import { ICON_TOKEN } from "common/richText/format";
import { abilityIcons } from "common/utils";
import { ICON_SPAN, iconSpan } from "../cardEditor/components/iconHtml";
import { useDeferredCallback } from "../../hooks/useDeferredCallback";
import { DEFAULT_FEATURES, extensionsFor, RichTextFeature } from "./extensions";
import { RichTextToolbar } from "./toolbar";

export type RichTextAreaProps = {
    value?: string;
    onValueChange?: (value: string | undefined) => void;
    label?: string;
    name?: string;
    placeholder?: string;
    features?: RichTextFeature[];
    isDisabled?: boolean;
    isRequired?: boolean;
    isInvalid?: boolean;
    errorMessage?: string;
    maxLength?: number;
    minRows?: number;
    className?: string;
};

const EMPTY = /^\s*<p>\s*(<br\s*\/?>)?\s*<\/p>\s*$/i;

/** Converts stored tokens to icon nodes for editing */
function toEditorHtml(html: string) {
    return html.replace(ICON_TOKEN, (match, name: string) => (name in abilityIcons ? iconSpan(name) : match));
}

/** Converts icon nodes back to stored tokens */
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
    const featureKey = [...features].sort().join(",");
    const enabled = useMemo(() => featureKey.split(",").filter(Boolean) as RichTextFeature[], [featureKey]);
    const extensions = useMemo(() => extensionsFor(enabled), [enabled]);

    const validation = useFormValidationState<string>({
        name,
        value: value ?? null,
        isInvalid,
        validationBehavior: "native"
    });
    const { isInvalid: isFieldInvalid, validationErrors } = validation.displayValidation;
    const shownError = errorMessage ?? validationErrors.join(" ");

    const validationRef = useRef(validation);
    const hasFormErrorRef = useRef(false);
    useEffect(() => {
        validationRef.current = validation;
        hasFormErrorRef.current = validation.displayValidation.validationErrors.length > 0;
    });

    const onValueChangeRef = useRef(onValueChange);
    useEffect(() => {
        onValueChangeRef.current = onValueChange;
    }, [onValueChange]);

    const lastEmitted = useRef(value);
    const syncedEditor = useRef<Editor | null>(null);

    const editorRef = useRef<Editor | null>(null);
    const { schedule, flush } = useDeferredCallback(() => {
        const editor = editorRef.current;
        if (!editor || editor.isDestroyed) {
            return;
        }
        const html = fromEditorHtml(editor.getHTML());
        if (html === lastEmitted.current) {
            return;
        }
        lastEmitted.current = html;
        onValueChangeRef.current?.(html);
    });

    const onEdit = useCallback(
        ({ editor }: { editor: Editor }) => {
            if (editor.isFocused && hasFormErrorRef.current) {
                validationRef.current.commitValidation();
            }
            schedule();
        },
        [schedule]
    );

    const editor = useEditor(
        {
            extensions,
            content: toEditorHtml(value ?? ""),
            editable: !isDisabled,
            onUpdate: onEdit,
            onBlur: flush,
            editorProps: {
                attributes: {
                    class: classNames(
                        "focus:outline-none p-2 max-w-none",
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

        const isSynced = syncedEditor.current === editor;
        syncedEditor.current = editor;
        if (isSynced && value === lastEmitted.current) {
            return;
        }
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

    const showsDanger = isFieldInvalid || overLimit;
    const helperText = isFieldInvalid ? shownError : "";

    return (
        <div className={classNames("flex flex-col w-full", className)}>
            {label && (
                <label
                    className={classNames("text-small pb-2", showsDanger ? "text-danger" : "text-foreground-600", {
                        "after:content-['*'] after:text-danger after:ms-0.5": isRequired
                    })}
                >
                    {label}
                </label>
            )}
            <div
                className={classNames(
                    "flex flex-col rounded-medium overflow-hidden shadow-xs",
                    "transition-background motion-reduce:transition-none !duration-150",
                    showsDanger ? "bg-danger-50" : "bg-default-100",
                    { "opacity-disabled pointer-events-none": isDisabled }
                )}
            >
                <RichTextToolbar editor={editor} features={enabled} isDisabled={isDisabled} />
                <div className={classNames("relative grow", { "text-danger": showsDanger })}>
                    {placeholder && isVisuallyEmpty && (
                        <span
                            className={classNames(
                                "pointer-events-none absolute top-2 start-2 text-small",
                                showsDanger ? "text-danger" : "text-foreground-500"
                            )}
                        >
                            {placeholder}
                        </span>
                    )}
                    <EditorContent editor={editor} className="grow" />
                </div>
            </div>
            {(helperText || maxLength) && (
                <div className="flex justify-between gap-2 p-1 text-tiny">
                    <span className="text-danger">{helperText}</span>
                    {maxLength && (
                        <span className={classNames("shrink-0", overLimit ? "text-danger" : "text-foreground-400")}>
                            {length}/{maxLength}
                        </span>
                    )}
                </div>
            )}
            {name && <input type="hidden" name={name} value={value ?? ""} />}
        </div>
    );
};

export default RichTextArea;
