import { ColorResolvable } from "discord.js";

export const emojis = {
    unique: "<:unique:701045474332770385>",
    military: "<:military:701045474291089460>",
    intrigue: "<:intrigue:701045474337226813>",
    power: "<:power:701045474433564712>",
    neutral: "<:neutral:701045474370781244>",
    baratheon: "<:baratheon:701045474332770344>",
    greyjoy: "<:greyjoy:701045474345353256>",
    lannister: "<:lannister:701045474290827306>",
    martell: "<:martell:701045474093826119>",
    thenightswatch: "<:nightswatch:701045474400141343>",
    stark: "<:stark:701045474370650112>",
    targaryen: "<:targaryen:701045474714452058>",
    tyrell: "<:tyrell:701045474374975528>",
    playtesting: ":dart:",
    physicalPlaytesting: ":flower_playing_cards:",
    digitalPlaytesting: ":computer:",
    changeLog: ":memo:",
    changeNotes: ":card_file_box:",
    implemented: ":white_check_mark:",
    notImplemented: ":no_entry_sign:",
    replaced: ":twisted_rightwards_arrows:",
    reworked: ":arrows_clockwise:",
    updated: ":arrow_double_up:",
    bugfixed: ":wrench:",
    other: ":eight_spoked_asterisk:",
    "Strongly agree": ":thumbsup::thumbsup:",
    "Somewhat agree": ":thumbsup:",
    "Neither agree nor disagree": ":fist:",
    "Somewhat disagree": ":thumbsdown:",
    "Strongly disagree": ":thumbsdown::thumbsdown:",
    white_check_mark: "\u2705"
} as { [emoji: string]: string };

export const colors = {
    review: "#660087",
    baratheon: "#e3d852",
    greyjoy: "#1d7a99",
    lannister: "#c00106",
    martell: "#e89521",
    stark: "#cfcfcf",
    thenightswatch: "#7a7a7a",
    targaryen: "#1c1c1c",
    tyrell: "#509f16",
    neutral: "#a99560"
} as { [color: string]: ColorResolvable };

export const icons = {
    reviewer: "https://cdn-icons-png.flaticon.com/128/6138/6138221.png"
} as { [icon: string]: string };

export function discordify(text: string) {
    // Html Converting
    let result = text
        .replace(/<i>|<\/i>/g, "*")
        .replace(/<b>|<\/b>/g, "**")
        .replace(/<em>|<\/em>/g, "*")
        .replace(/<s>|<\/s>/g, "~~")
        .replace(/<cite>/g, "-")
        .replace(/<\/cite>/g, "")
        .replace(/<br>/g, "")
        .replace(/ {2}/g, " &nbsp;");
    // Replace all potential emojis with their codes
    for (const [key, emoji] of Object.entries(emojis)) {
        result = result.replaceAll(`[${key}]`, emoji);
    }
    return result;
}