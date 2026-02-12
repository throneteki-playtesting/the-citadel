import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { BaseElementProps } from "../../../types";
import { Dispatch, SetStateAction, useEffect } from "react";
import { Button } from "@heroui/react";
import ThronesIcon, { Icon } from "../../thronesIcon";
import { AbilityIcon, AutoTextConversions, NewLine, Trait, TriggeredAbility } from "./abilityEditorExtensions";
import classNames from "classnames";
import { abilityIcons } from "common/utils";

function convertIncomingText(text?: string) {
    return text?.replace(/\n/g, "<br>") ?? "";
}

function convertOutgoingHtml(html: string) {
    return html.replace(/<br\s*\/?>/gi, "\n").replace(/<span>\[(\w+)\]<\/span>/g, "[$1]");
}

export const AbilityEditor = ({ value: text, setValue: setText, isDisabled, errorMessage }: AbilityTextEditorProps<string>) => {
    const TextDocument = Document.extend({
        content: "inline*",
        marks: "_"
    });

    const editor = useEditor({
        extensions: [TextDocument, Text, TriggeredAbility, AutoTextConversions, Trait, AbilityIcon, NewLine],
        content: convertIncomingText(text),
        onUpdate({ editor }) {
            const html = convertOutgoingHtml(editor.getHTML()) || undefined;
            setText(html);
        },
        editorProps: {
            attributes: {
                class: "whitespace-pre-wrap min-h-[6.5rem] focus:outline-none p-2"
            }
        }
    });

    useEffect(() => {
        if (!editor) {
            return;
        }
        if (typeof isDisabled !== "undefined") {
            editor.setEditable(!isDisabled);
        }
        const currentPlain = editor.getText();
        const incomingPlain = text ?? "";

        if (!editor.isFocused && incomingPlain !== currentPlain) {
            editor.commands.setContent(convertIncomingText(incomingPlain));
        }
    }, [text, editor, isDisabled]);

    const EditorButton = ({ className, style, command, children }: BaseElementProps & { key: string, command: () => boolean }) => {
        return (
            <Button className={className} style={style} onPress={() => command()} isIconOnly={true} radius="none" size="sm">
                {children}
            </Button>
        );
    };

    return (
        <div className={classNames("bg-default-100 rounded-xl overflow-hidden", { "bg-blend-darken": isDisabled })}>
            <div className="bg-default pt-1 px-1">
                <EditorButton key="trait" className="font-crimson italic font-bold text-medium" command={() => editor.chain().focus().toggleTrait().run()}>
                    T
                </EditorButton>
                {
                    Object.keys(abilityIcons).map((icon) => (
                        <EditorButton key={icon} command={() => editor.chain().focus().insertThronesIcon(icon).run()}>
                            <ThronesIcon name={icon as Icon}/>
                        </EditorButton>
                    ))
                }
            </div>
            <EditorContent editor={editor}/>
            {errorMessage && <div className="text-tiny text-danger">{errorMessage}</div>}
        </div>
    );
};

type AbilityTextEditorProps<T> = Omit<BaseElementProps, "children"> & { value?: T, setValue: Dispatch<SetStateAction<T | undefined>>, isDisabled?: boolean, errorMessage?: string };


export default AbilityEditor;