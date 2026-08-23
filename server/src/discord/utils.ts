import { ColorResolvable } from "discord.js";
import { dataService } from "@/services";

/** Discord's own caps on how much text a single embed part will carry */
export const EMBED_DESCRIPTION_MAX = 4096;
export const EMBED_FIELD_MAX = 1024;

// Emoji standing for a concept rather than an icon - a note's type, a review answer. Discord's own
// shortcodes, so nothing on the guild to look up; custom emoji are read live via getEmojiMap() instead
export const labelEmojis = {
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
    refinement: ":gem:",
    bugfixed: ":wrench:",
    other: ":eight_spoked_asterisk:",
    "strongly agree": ":thumbsup::thumbsup:",
    "somewhat agree": ":thumbsup:",
    "neither agree nor disagree": ":fist:",
    "somewhat disagree": ":thumbsdown:",
    "strongly disagree": ":thumbsdown::thumbsdown:",
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

// Read from our synced roles rather than the guild; 0 is Discord's own "no colour", so it doubles as the fallback
export async function getRoleColor(name: string) {
    const [role] = await dataService.roles.read({ name });
    return role?.color ?? 0;
}

// Discord messages read as prose, so counts are written out rather than hedged with "(s)"
export function plural(count: number, singular: string, plural = `${singular}s`) {
    return count === 1 ? singular : plural;
}

// Splits the trailing guild/channel/message ids out of a message url. A thread's starter message carries
// the thread's own id in both the channel and message positions
export function extractFromURL(url: string) {
    const [, guildId, channelId, messageId] = url.match(/(\d+)\/(\d+)\/(\d+)$/) || [];
    return { guildId, channelId, messageId };
}
