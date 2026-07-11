export const emojis = {
    announcement: ":loudspeaker:",
    implemented: ":white_check_mark:",
    replaced: ":twisted_rightwards_arrows:",
    reworked: ":arrows_clockwise:",
    updated: ":arrow_double_up:",
    wording: ":pencil2:"
};

export function githubify(text: string) {
    // Html Converting
    return text
        .replace(/<i>|<\/i>/g, "***")
        .replace(/<b>|<\/b>/g, "**")
        .replace(/<em>|<\/em>/g, "_")
        .replace(/<s>|<\/s>/g, "~~")
        .replace(/<cite>/g, "-")
        .replace(/<\/cite>/g, "")
        .replace(/<br>/g, "\n")
        .replace(/<h1>/g, "# ")
        .replace(/<\/h1>/g, "")
        .replace(/<h2>/g, "## ")
        .replace(/<\/h2>/g, "")
        .replace(/<h3>/g, "### ")
        .replace(/<\/h3>/g, "")
        .replace(/ {2}/g, " &nbsp;");
}