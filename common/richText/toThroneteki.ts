// The pack dialect, the one place <i> still means bold-italic. Deliberately not built on `walk`, which
// expands <i> into <b><em> - exactly the direction this undoes. Icon tokens already spell it the pack way
export function toThronetekiText(html: string) {
    return (
        (html ?? "")
            // Bold-italic is a single span in the pack format, whichever order the two marks nest in
            .replace(/<b>\s*<em>([\s\S]*?)<\/em>\s*<\/b>/gi, "<i>$1</i>")
            .replace(/<em>\s*<b>([\s\S]*?)<\/b>\s*<\/em>/gi, "<i>$1</i>")
            // Italic alone has no separate spelling on a card, where emphasis has always been bold-italic
            .replace(/<em>/gi, "<i>")
            .replace(/<\/em>/gi, "</i>")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            // A card's text box has no concept of anything else, so only the text of it survives
            .replace(/<(?!\/?[bi]>)[^>]*>/gi, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
    );
}
