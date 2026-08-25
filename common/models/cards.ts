import { SemanticVersion } from "../utils";
import * as Projects from "./projects";
import { IAuditable } from "./shared";

export const factions = [
    "baratheon",
    "greyjoy",
    "lannister",
    "martell",
    "thenightswatch",
    "stark",
    "targaryen",
    "tyrell",
    "neutral"
] as const;
export const types = ["character", "location", "attachment", "event", "plot", "agenda"] as const;
export const noteTypes = ["updated", "reworked", "replaced", "refinement"] as const;
export const githubStatuses = ["open", "closed"] as const;
export const challengeIcons = ["military", "intrigue", "power"] as const;
export const plotStats = ["income", "initiative", "claim", "reserve"] as const;
export type Faction = (typeof factions)[number];
export type Type = (typeof types)[number];
export type NoteType = (typeof noteTypes)[number];
export type ChallengeIcon = (typeof challengeIcons)[number];
export type PlotStat = (typeof plotStats)[number];

export type Code = `${Projects.Code}${number}`;
export type Cost = number | "X" | "-";
export type Strength = number | "X";
export type PlotValue = number | "X";
export type Quantity = 1 | 2 | 3;

/**
 * Base released card, fitting structure of JSON Card Data Repository, minus certain fields
 */
export interface ICard {
    code?: Code;
    cost?: Cost;
    deckLimit: number;
    designer?: string;
    faction: Faction;
    flavor?: string;
    icons?: Icons;
    illustrator: string;
    loyal?: boolean;
    name: string;
    plotStats?: PlotStats;
    strength?: Strength;
    traits: string[];
    text: string;
    type: Type;
    unique?: boolean;
    // octgnId?: string,
    quantity: Quantity;
    // errata: ?, Probably not necessary
    // imageUrl?: string
}

export interface Icons {
    military: boolean;
    intrigue: boolean;
    power: boolean;
}

export interface PlotStats {
    income: PlotValue;
    initiative: PlotValue;
    claim: PlotValue;
    reserve: PlotValue;
}

export enum DefaultDeckLimit {
    character = 3,
    attachment = 3,
    location = 3,
    event = 3,
    plot = 2,
    agenda = 1
}

export interface IPlaytestCard extends ICard, IAuditable {
    project: number;
    number: number;
    version: SemanticVersion;
    latest: boolean;
    draft: boolean;
    note?: NoteDetails;
    playtesting?: SemanticVersion;
    implemented: boolean;
    suggestionId?: string;
    /** Stamped once, permanently, by the publish action - presence means this exact card version shipped in a published pack */
    released?: {
        code: string;
        number: number;
    };
    _metadata?: {
        github?: {
            status?: (typeof githubStatuses)[number];
            issueUrl?: string;
            closedAt?: Date;
            lastSynced?: Date;
        };
        discord?: {
            messageUrl?: string;
            lastSynced?: Date;
        };
        imageUrl?: string;
    };
}

/** Priority for picking "the" version of a card number to act on - released-latest, then draft, then plain latest. Lower is higher priority. */
export function cardVersionRank(card: IPlaytestCard): number {
    if (card.latest && card.released) {
        return 0;
    }
    if (card.draft) {
        return 1;
    }
    if (card.latest) {
        return 2;
    }
    return 3;
}

/** Reduces a mixed list down to one card per number - whichever has the lowest cardVersionRank */
export function pickVisibleCards(cards: IPlaytestCard[]): IPlaytestCard[] {
    const byNumber = new Map<number, IPlaytestCard>();
    for (const card of cards) {
        const current = byNumber.get(card.number);
        if (!current || cardVersionRank(card) < cardVersionRank(current)) {
            byNumber.set(card.number, card);
        }
    }
    return Array.from(byNumber.values());
}

export interface NoteDetails {
    type: NoteType;
    text: string;
}

export interface IRenderCard extends ICard {
    key: string;
    watermark: Watermark;
}

export interface Watermark {
    top?: string;
    middle?: string;
    bottom?: string;
}

export interface ILabeledCard extends ICard {
    label: string;
    imageUrl: string;
    workInProgress: boolean;
}

export interface ICardSuggestion extends IAuditable {
    /** Unique Id of this saved suggestion (undefined for new) */
    id?: string;
    /** User who suggested */
    user: {
        discordId: string;
        displayname: string;
    };
    _metadata?: {
        discord?: {
            messageUrl?: string;
            lastSynced?: Date;
        };
    };
    /** Discord Id array of users who like this suggestion */
    likedBy: string[];
    /** Discord Id of user who approved this suggestion */
    approvedBy?: string;
    /** Reason for this suggestion to be archived, or undefined if not archived */
    archivedReason?: string;
    /** Additional tags related to this suggestion */
    tags: string[];
    /** Card design */
    card: ICard;
}
