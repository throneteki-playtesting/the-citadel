import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { BaseElementProps } from "../../../types";
import { type Dispatch, type SetStateAction, useEffect, useMemo } from "react";
import { Button, Divider, ScrollShadow } from "@heroui/react";
import ThronesIcon from "../../thronesIcon";
import PlotStatIcon from "../../plotStatIcon";
import { TouchTooltip } from "../../touchTooltip";
import {
    AbilityIcon,
    AutoTextConversions,
    NewLine,
    PlotModifierCapture,
    Trait,
    TriggeredAbility
} from "./abilityEditorExtensions";
import {
    DEFAULT_PLOT_MODIFIER,
    getCapturedPlotModifiers,
    joinPlotModifiers,
    PlotModifiers,
    splitPlotModifiers
} from "./plotModifiers";
import { PlotModifierChips } from "./plotModifierChips";
import classNames from "classnames";
import { abilityIcons, factionNames, titleCase } from "common/utils";
import { challengeIcons, factions, PlotStat, plotStats } from "common/models/cards";

function convertIncomingText(text?: string) {
    return (
        text
            ?.replace(/\n/g, "<br>")
            .replace(/(?::([a-zA-Z0-9_]+):|\[([a-zA-Z0-9_]+)\])/g, (match, colonName, bracketName) => {
                const name = colonName || bracketName;
                return abilityIcons[name] ? `<span data-thrones-icon="${name}">[${name}]</span>` : match;
            }) ?? ""
    );
}

function convertOutgoingHtml(html: string) {
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<span[^>]*data-thrones-icon="(\w+)"[^>]*>[^<]*<\/span>/g, "[$1]");
}

const TextDocument = Document.extend({
    content: "inline*",
    marks: "_"
});

// Only the icons the ability font can actually render, labelled the way the rest of the app names them
const challengeIconButtons = challengeIcons
    .filter((icon) => icon in abilityIcons)
    .map((icon) => ({ icon, label: titleCase(icon) }));
const factionIconButtons = factions
    .filter((faction) => faction in abilityIcons)
    .map((faction) => ({ icon: faction, label: factionNames[faction] }));

const EditorButton = ({
    className,
    style,
    label,
    command,
    isActive,
    isDisabled,
    children
}: Omit<BaseElementProps, "children"> & {
    label: string;
    command: () => void;
    isActive?: boolean;
    isDisabled?: boolean;
    children?: BaseElementProps["children"];
}) => {
    return (
        <TouchTooltip content={label} size="sm" delay={500} closeDelay={0}>
            <Button
                className={classNames(
                    // Larger tap targets on touch-sized screens, compact on desktop
                    "shrink-0 size-9 min-w-9 sm:size-8 sm:min-w-8 transition-transform data-[pressed=true]:scale-90",
                    className
                )}
                style={style}
                aria-label={label}
                onMouseDown={(e) => {
                    e.preventDefault();
                    command();
                }}
                isIconOnly={true}
                radius="sm"
                size="sm"
                variant={isActive ? "solid" : "light"}
                color={isActive ? "primary" : "default"}
                isDisabled={isDisabled}
            >
                {children}
            </Button>
        </TouchTooltip>
    );
};

const ToolbarDivider = () => <Divider orientation="vertical" className="shrink-0 h-5 mx-0.5" />;

export const AbilityEditor = ({
    value: text,
    setValue: setText,
    isDisabled,
    errorMessage
}: AbilityTextEditorProps<string>) => {
    // Modifiers are managed by the chip row rather than the editor, so they are kept out of the document
    // entirely and reattached as the text's trailing line
    const { body, modifiers } = useMemo(() => splitPlotModifiers(text), [text]);

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
        onUpdate({ editor, transaction, appendedTransactions }) {
            // Typing tags the appended transaction, pasting tags the root one; either overrides that chip
            const captured = getCapturedPlotModifiers([transaction, ...appendedTransactions]);
            setText(joinPlotModifiers(convertOutgoingHtml(editor.getHTML()), { ...modifiers, ...captured }));
        },
        editorProps: {
            attributes: {
                class: "whitespace-pre-wrap min-h-[6.5rem] focus:outline-none p-2 [&_i]:font-bold"
            }
        }
    });

    const isTraitActive = useEditorState({
        editor,
        selector: ({ editor }) => !!editor?.isActive("trait")
    });

    const setModifiers = (modifiers: PlotModifiers) => {
        setText(joinPlotModifiers(body, modifiers));
    };

    const togglePlotModifier = (stat: PlotStat) => {
        const { [stat]: current, ...remaining } = modifiers;
        setModifiers(current === undefined ? { ...modifiers, [stat]: DEFAULT_PLOT_MODIFIER } : remaining);
    };

    useEffect(() => {
        if (!editor) {
            return;
        }
        if (typeof isDisabled !== "undefined") {
            editor.setEditable(!isDisabled);
        }
        // Only while unfocused, so an external change can never yank the document out from under the caret
        if (!editor.isFocused && body !== convertOutgoingHtml(editor.getHTML())) {
            editor.commands.setContent(convertIncomingText(body));
        }
    }, [body, editor, isDisabled]);

    return (
        <div
            className={classNames("flex flex-col bg-default-100 rounded-xl overflow-hidden", {
                "bg-blend-darken": isDisabled
            })}
        >
            <ScrollShadow
                orientation="horizontal"
                hideScrollBar={true}
                className="bg-default flex items-center gap-0.5 p-1"
            >
                <EditorButton
                    className="font-crimson italic font-bold text-medium"
                    label="Trait"
                    command={() => editor.chain().focus().toggleTrait().run()}
                    isActive={isTraitActive}
                    isDisabled={isDisabled}
                >
                    T
                </EditorButton>
                <ToolbarDivider />
                {challengeIconButtons.map(({ icon, label }) => (
                    <EditorButton
                        key={icon}
                        label={label}
                        command={() => editor.chain().focus().insertThronesIcon(icon).run()}
                        isDisabled={isDisabled}
                    >
                        <ThronesIcon name={icon} />
                    </EditorButton>
                ))}
                <ToolbarDivider />
                {factionIconButtons.map(({ icon, label }) => (
                    <EditorButton
                        key={icon}
                        label={label}
                        command={() => editor.chain().focus().insertThronesIcon(icon).run()}
                        isDisabled={isDisabled}
                    >
                        <ThronesIcon name={icon} />
                    </EditorButton>
                ))}
                <ToolbarDivider />
                {plotStats.map((stat) => (
                    <EditorButton
                        key={stat}
                        label={`${titleCase(stat)} modifier`}
                        command={() => togglePlotModifier(stat)}
                        isActive={modifiers[stat] !== undefined}
                        isDisabled={isDisabled}
                    >
                        <PlotStatIcon name={stat} />
                    </EditorButton>
                ))}
            </ScrollShadow>
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
