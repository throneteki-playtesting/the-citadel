import Permission from "common/models/permissions";
import { enumToArray } from "./utils";
import { Faction } from "common/models/cards";
import { ChangeType } from "common/types";
import * as discordEmojis from "discord-emoji";
import { IPlaytestReview, StatementAnswer } from "common/models/reviews";

export const availablePermissions = enumToArray(Permission);

const permissionMeta: Record<Permission, { label: string; group: string }> = {
    [Permission.READ_PROJECTS]: { label: "Read", group: "Projects" },
    [Permission.READ_ALL_PROJECTS]: { label: "Read All", group: "Projects" },
    [Permission.CREATE_PROJECTS]: { label: "Create", group: "Projects" },
    [Permission.EDIT_PROJECTS]: { label: "Edit", group: "Projects" },
    [Permission.DELETE_PROJECTS]: { label: "Delete", group: "Projects" },
    [Permission.INITIALISE_PROJECTS]: { label: "Initialise", group: "Projects" },
    [Permission.READ_PLAYTESTING_UPDATES]: { label: "Read Updates", group: "Playtesting" },
    [Permission.CREATE_PLAYTESTING_UPDATES]: { label: "Create Updates", group: "Playtesting" },
    [Permission.READ_CARDS]: { label: "Read", group: "Cards" },
    [Permission.CREATE_CARDS]: { label: "Create", group: "Cards" },
    [Permission.EDIT_CARDS]: { label: "Edit", group: "Cards" },
    [Permission.DELETE_CARDS]: { label: "Delete", group: "Cards" },
    [Permission.RENDER_CARDS]: { label: "Render", group: "Cards" },
    [Permission.READ_SUGGESTIONS]: { label: "Read", group: "Suggestions" },
    [Permission.MAKE_SUGGESTIONS]: { label: "Make Own", group: "Suggestions" },
    [Permission.EDIT_SUGGESTIONS]: { label: "Edit Others", group: "Suggestions" },
    [Permission.DELETE_SUGGESTIONS]: { label: "Delete Others", group: "Suggestions" },
    [Permission.IMPORT_SUGGESTIONS]: { label: "Import", group: "Suggestions" },
    [Permission.EXPORT_SUGGESTIONS]: { label: "Export", group: "Suggestions" },
    [Permission.READ_REVIEWS]: { label: "Read", group: "Reviews" },
    [Permission.MAKE_REVIEWS]: { label: "Make Own", group: "Reviews" },
    [Permission.EDIT_REVIEWS]: { label: "Edit Others", group: "Reviews" },
    [Permission.DELETE_REVIEWS]: { label: "Delete Others", group: "Reviews" },
    [Permission.READ_USERS]: { label: "Read", group: "Users" },
    [Permission.EDIT_USERS]: { label: "Edit", group: "Users" },
    [Permission.READ_ROLES]: { label: "Read", group: "Roles" },
    [Permission.EDIT_ROLES]: { label: "Edit", group: "Roles" },
    [Permission.READ_DISCORD_CARD_FORUM]: { label: "View Card Forum", group: "Discord" },
    [Permission.READ_DISCORD_REVIEW_FORUM]: { label: "View Review Forum", group: "Discord" },
    [Permission.SYNC_CARD_IMAGES]: { label: "Card Images", group: "Sync" },
    [Permission.SYNC_CARD_DISCORD]: { label: "Card Discord", group: "Sync" },
    [Permission.SYNC_CARD_GITHUB]: { label: "Card GitHub", group: "Sync" },
    [Permission.SYNC_PROJECT_GITHUB]: { label: "Project GitHub", group: "Sync" },
    [Permission.SYNC_REVIEW_DISCORD]: { label: "Review Discord", group: "Sync" }
};

export const permissionGroups = (Object.entries(permissionMeta) as [Permission, { label: string; group: string }][]).reduce<
    { label: string; permissions: { value: Permission; label: string }[] }[]
>((groups, [value, { label, group }]) => {
    let existing = groups.find(g => g.label === group);
    if (!existing) {
        existing = { label: group, permissions: [] };
        groups.push(existing);
    }
    existing.permissions.push({ value, label });
    return groups;
}, []);

export const factionBorderClasses: Record<Faction, string> = {
    baratheon: "border-baratheon/30",
    greyjoy: "border-greyjoy/30",
    lannister: "border-lannister/30",
    martell: "border-martell/30",
    thenightswatch: "border-thenightswatch/30",
    stark: "border-stark/20",
    targaryen: "border-targaryen",
    tyrell: "border-tyrell/30",
    neutral: "border-neutral/30"
};

export const watermarkClasses: Record<string, string> = {
    baratheon: "text-baratheon opacity-30",
    greyjoy: "text-greyjoy opacity-30",
    lannister: "text-lannister opacity-30",
    martell: "text-martell opacity-30",
    thenightswatch: "text-thenightswatch opacity-30",
    stark: "text-stark opacity-20",
    targaryen: "text-targaryen brightness-200",
    tyrell: "text-tyrell opacity-30",
    neutral: "text-neutral opacity-30"
};

export const changeTypeClasses: Record<ChangeType, string> = {
    new: "border-success-300 bg-success-100 text-success-700",
    draft: "border-secondary-300 bg-secondary-100 text-secondary-700",
    preview: "border-secondary-300 bg-secondary-100 text-secondary-700",
    updated: "border-secondary-300 bg-secondary-100 text-secondary-700",
    reworked: "border-warning-300 bg-warning-100 text-warning-700",
    replaced: "border-danger-300 bg-danger-100 text-danger-700"
};


export const dismoji: { [emoji: string]: string } = {};

for (const categoryName in discordEmojis) {
    const categoryEmojis = (discordEmojis as { [category: string]: { [emoji: string]: string }})[categoryName];
    if (typeof categoryEmojis == "object" && categoryEmojis !== null && !Array.isArray(categoryEmojis)) {
        Object.assign(dismoji, categoryEmojis);
    }
}

export const emojis = {
    playtesting: "dart",
    physicalplaytesting: "flower_playing_cards",
    digitalplaytesting: "computer",
    changeLog: "memo",
    changeNotes: "card_file_box",
    implemented: "white_check_mark",
    notimplemented: "no_entry_sign",
    replaced: "twisted_rightwards_arrows",
    reworked: "arrows_clockwise",
    updated: "arrow_double_up",
    bugfixed: "wrench",
    other: "eight_spoked_asterisk"
} as { [emoji: string]: string };

export const highlightTarget = {
    review: (review: IPlaytestReview) => `review-${review.project}|${review.number}|${review.version}|${review.reviewer}`
} as const;

export const statementOptions: { value: StatementAnswer; color: "danger" | "warning" | "default" | "secondary" | "success" }[] = [
    { value: "strongly disagree", color: "danger" },
    { value: "somewhat disagree", color: "warning" },
    { value: "neither agree nor disagree", color: "default" },
    { value: "somewhat agree", color: "secondary" },
    { value: "strongly agree", color: "success" }
];