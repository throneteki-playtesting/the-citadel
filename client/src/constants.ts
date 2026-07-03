import { Faction } from "common/models/cards";
import { ChangeType } from "common/types";
import * as discordEmojis from "discord-emoji";
import { IPlaytestReview, StatementAnswer } from "common/models/reviews";

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

export const factionBarClasses: Record<Faction, string> = {
    baratheon: "bg-baratheon/50",
    greyjoy: "bg-greyjoy/50",
    lannister: "bg-lannister/50",
    martell: "bg-martell/50",
    thenightswatch: "bg-thenightswatch/50",
    stark: "bg-stark/50",
    targaryen: "bg-targaryen/50",
    tyrell: "bg-tyrell/50",
    neutral: "bg-neutral/50"
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
    review: (review: IPlaytestReview) => `review-${review.project}|${review.number}|${review.version}|${review.reviewer}`,
    factionCarousel: (project: number, faction: Faction) => `faction-${project}|${faction}`
} as const;

export const statementOptions: { value: StatementAnswer; color: "danger" | "warning" | "default" | "secondary" | "success" }[] = [
    { value: "strongly disagree", color: "danger" },
    { value: "somewhat disagree", color: "warning" },
    { value: "neither agree nor disagree", color: "default" },
    { value: "somewhat agree", color: "secondary" },
    { value: "strongly agree", color: "success" }
];