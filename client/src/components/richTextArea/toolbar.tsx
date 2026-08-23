import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faBold,
    faCode,
    faItalic,
    faListOl,
    faListUl,
    faQuoteRight,
    faStrikethrough,
    faUnderline
} from "@fortawesome/free-solid-svg-icons";
import { Editor, useEditorState } from "@tiptap/react";
import { memo, useMemo } from "react";
import { Icon } from "../thronesIcon";
import { OverflowToolbar, ToolbarItem } from "../editorToolbar";
import { iconItems } from "../editorToolbar/iconItems";
import { mod } from "../editorToolbar/shortcuts";
import { RichTextFeature } from "./extensions";

// Subscribes to the editor rather than taking active states as props, so a keystroke re-renders this
// only when a mark it draws actually flips
export const RichTextToolbar = memo(function RichTextToolbar({
    editor,
    features,
    isDisabled
}: {
    editor: Editor;
    features: RichTextFeature[];
    isDisabled?: boolean;
}) {
    const active = useEditorState({
        editor,
        selector: ({ editor }) => ({
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            strike: editor.isActive("strike"),
            code: editor.isActive("code"),
            bulletList: editor.isActive("bulletList"),
            orderedList: editor.isActive("orderedList"),
            blockquote: editor.isActive("blockquote"),
            h1: editor.isActive("heading", { level: 1 }),
            h2: editor.isActive("heading", { level: 2 }),
            h3: editor.isActive("heading", { level: 3 })
        })
    });

    // Priority order: the marks anybody uses, then structure, then icons. Whatever is listed last is
    // what drops into the overflow menu first
    const items = useMemo<ToolbarItem[]>(() => {
        const insert = (icon: Icon) => editor.chain().focus().insertThronesIcon(icon).run();
        const has = (feature: RichTextFeature) => features.includes(feature);

        const marks: ToolbarItem[] = [
            {
                key: "bold",
                label: "Bold",
                shortcut: `${mod}+B`,
                command: () => editor.chain().focus().toggleBold().run(),
                isActive: active.bold,
                icon: <FontAwesomeIcon icon={faBold} />
            },
            {
                key: "italic",
                label: "Italic",
                shortcut: `${mod}+I`,
                command: () => editor.chain().focus().toggleItalic().run(),
                isActive: active.italic,
                icon: <FontAwesomeIcon icon={faItalic} />
            },
            {
                key: "underline",
                label: "Underline",
                shortcut: `${mod}+U`,
                command: () => editor.chain().focus().toggleUnderline().run(),
                isActive: active.underline,
                icon: <FontAwesomeIcon icon={faUnderline} />
            },
            {
                key: "strike",
                label: "Strikethrough",
                shortcut: `${mod}+Shift+S`,
                command: () => editor.chain().focus().toggleStrike().run(),
                isActive: active.strike,
                icon: <FontAwesomeIcon icon={faStrikethrough} />
            }
        ];

        // Drawn only where the extension is loaded, so no button offers a command the schema cannot run
        const headings: ToolbarItem[] = has("headings")
            ? [
                  { kind: "divider", key: "divider-headings" },
                  ...([1, 2, 3] as const).map((level) => ({
                      key: `h${level}`,
                      label: `Heading ${level}`,
                      shortcut: `${mod}+Alt+${level}`,
                      command: () => editor.chain().focus().toggleHeading({ level }).run(),
                      isActive: active[`h${level}` as "h1" | "h2" | "h3"],
                      className: "font-bold text-medium",
                      icon: <span>H{level}</span>
                  }))
              ]
            : [];

        const blocks: ToolbarItem[] = [
            ...(has("lists")
                ? [
                      {
                          key: "bulletList",
                          label: "Bullet list",
                          shortcut: `${mod}+Shift+8`,
                          command: () => editor.chain().focus().toggleBulletList().run(),
                          isActive: active.bulletList,
                          icon: <FontAwesomeIcon icon={faListUl} />
                      },
                      {
                          key: "orderedList",
                          label: "Numbered list",
                          shortcut: `${mod}+Shift+7`,
                          command: () => editor.chain().focus().toggleOrderedList().run(),
                          isActive: active.orderedList,
                          icon: <FontAwesomeIcon icon={faListOl} />
                      }
                  ]
                : []),
            ...(has("quote")
                ? [
                      {
                          key: "blockquote",
                          label: "Quote",
                          shortcut: `${mod}+Shift+B`,
                          command: () => editor.chain().focus().toggleBlockquote().run(),
                          isActive: active.blockquote,
                          icon: <FontAwesomeIcon icon={faQuoteRight} />
                      }
                  ]
                : []),
            ...(has("code")
                ? [
                      {
                          key: "code",
                          label: "Code",
                          shortcut: `${mod}+E`,
                          command: () => editor.chain().focus().toggleCode().run(),
                          isActive: active.code,
                          icon: <FontAwesomeIcon icon={faCode} />
                      }
                  ]
                : [])
        ];

        return [
            ...marks,
            ...headings,
            ...(blocks.length > 0 ? [{ kind: "divider", key: "divider-blocks" } as ToolbarItem, ...blocks] : []),
            ...iconItems(insert)
        ];
    }, [active, editor, features]);

    return <OverflowToolbar items={items} isDisabled={isDisabled} className="bg-default p-1" />;
});
