import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faAnglesUp, faArrowRightArrowLeft, faArrowRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { Faction, NoteType } from "common/models/cards";
import { SemanticVersion } from "common/utils";
import { valid } from "semver";
import ThronesIcon, { Icon } from "./components/thronesIcon";

export function enumToArray<T extends { [key: string]: string | number }>(
    e: T
): { key: T[keyof T]; value: Extract<keyof T, string> }[] {
    return Object.keys(e)
        .filter(k => isNaN(Number(k)))
        .map(k => ({
            key: e[k as keyof T],
            value: k as Extract<keyof T, string>
        }));
}

export function downloadBlob(blob: Blob, fallbackFilename?: string): void {
    const filename = fallbackFilename ?? crypto.randomUUID();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function parseParamNumber(param?: string | null) {
    if (!param) {
        return undefined;
    }
    const parsed = parseInt(param);
    return isNaN(parsed) ? undefined : parsed;
}
export function parseParamSemanticVersion(param?: string) {
    if (!param) {
        return undefined;
    }
    return (valid(param) ?? undefined) as SemanticVersion| undefined;
}

export function getFactionCardImage(faction: Faction) {
    return `https://thronesdb.com/images/factions/${faction}.png`;
}

export const noteTypeIcon: Record<NoteType, IconDefinition> = {
    updated: faAnglesUp,
    reworked: faArrowRotateLeft,
    replaced: faArrowRightArrowLeft
};

export function daysFromNow(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
}

export function convertToNode(htmlString: string): React.ReactNode[] {
    const raw = htmlString
        .replace(/(?<=\n?)([^\n]+)(?=\n?)/g, "<p>$1</p>")
        .replace(/\[([^\]]+)\]/g, "<icon name=\"$1\"></icon>")
        // If any lists are detected, create the ul...
        .replace(/((?:<p>-.*<\/p>\s*)+)/g, "<ul>$1</ul>")
        // ... and wrap each line in li
        .replace(/<p>-\s*(.*?)<\/p>/g, "<li>$1</li>")
        .replace(/\n/g, "");

    const parser = new DOMParser();
    const body = parser.parseFromString(raw, "text/html").body;

    const transformNode = (node: ChildNode | Element, key: number) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const children = Array.from(el.childNodes).map((child, i) => transformNode(child, i));

            switch (el.tagName.toLowerCase()) {
                case "p":
                    return <span key={key}>{children}</span>;
                case "b":
                    return <b key={key} className="font-bold">{children}</b>;
                case "i":
                    return <i key={key} className="italic font-bold">{children}</i>;
                case "ul":
                    return <ul key={key} className="list-disc ms-1 me-1 ps-8">{children}</ul>;
                case "li":
                    return <li key={key} className="py-0.5">{children}</li>;
                case "icon":
                    return <ThronesIcon key={key} name={el.getAttribute("name") as Icon} />;
                default:
                    return <span key={key}>{children}</span>;
            }
        }
        return null;
    };
    return body ? Array.from(body.childNodes).map((node, i) => transformNode(node, i)) : [];
};
