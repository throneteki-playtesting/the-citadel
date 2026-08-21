import { createElement, Fragment, ReactNode, useMemo } from "react";
import { ALLOWED_TAGS, ICON_TOKEN } from "common/richText/format";
import { sanitiseHtml } from "common/richText/sanitise";
import { abilityIcons } from "common/utils";
import ThronesIcon, { Icon } from "./thronesIcon";

// How each tag reads on the page - the same set the editor applies to its own document, so a note looks
// the way it looked while it was being written
const TAG_CLASSES: Record<string, string> = {
    b: "font-bold",
    em: "italic",
    s: "line-through",
    u: "underline",
    cite: "italic",
    code: "bg-default-200 rounded px-1",
    p: "mb-2 last:mb-0",
    h1: "text-xl font-bold",
    h2: "text-large font-bold",
    h3: "font-bold",
    ul: "list-disc ps-6",
    ol: "list-decimal ps-6",
    li: "py-0.5",
    blockquote: "border-s-2 border-default-400 ps-3",
    pre: "bg-default-200 rounded p-2 whitespace-pre-wrap"
};

// Splitting on a capturing pattern hands back the captures between the pieces, so every odd entry is a
// name - and one naming no icon we hold keeps its brackets and stays the text it always was
function withIcons(text: string): ReactNode[] {
    return text.split(ICON_TOKEN).map((part, index) => {
        if (index % 2 === 0) {
            return part;
        }
        return part in abilityIcons ? (
            <ThronesIcon key={index} name={part as Icon} />
        ) : (
            <Fragment key={index}>[{part}]</Fragment>
        );
    });
}

function renderNode(node: ChildNode, key: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
        return <Fragment key={key}>{withIcons(node.textContent ?? "")}</Fragment>;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes).map(renderNode);

    if (tag === "br") {
        return <br key={key} />;
    }
    // Sanitising dropped anything outside the format, so this is only the parser's own wrappers
    if (!ALLOWED_TAGS.includes(tag)) {
        return <Fragment key={key}>{children}</Fragment>;
    }

    return createElement(tag, { key, className: TAG_CLASSES[tag] }, children);
}

// The format's fourth target, alongside Discord, Github and the pack data. Nothing is set as innerHTML -
// it is sanitised then rebuilt as elements, so only tags named here reach the page. No wrapper of its own
export default function RichText({ html }: { html?: string }) {
    const nodes = useMemo(() => {
        if (!html) {
            return null;
        }
        const body = new DOMParser().parseFromString(sanitiseHtml(html), "text/html").body;
        return Array.from(body.childNodes).map(renderNode);
    }, [html]);

    return <>{nodes}</>;
}
