import { SemanticVersion } from "../utils";
import * as Projects from "./projects";
import { IAuditable } from "./shared";
import { RewardType } from "../designGuidelines/rewardTypes";
import { PunishmentType } from "../designGuidelines/punishmentTypes";

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

/** Base released card, fitting the JSON Card Data Repository's structure, minus certain fields */
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

/** Questions asked of a suggestion's submitter - distinct from `IDerivedFields`, which is computed
 *  automatically from `card.text` and never asked of anyone. */
export interface ISuggestionQuestions {
    rewardTypes: RewardType[];
    punishment: PunishmentType[];
    /** Manual count of triggered abilities - gates naturalTrigger/repeatabilityRestricted and the
     *  triggeredAbilityFocus checklist rule. */
    triggeredAbilityCount?: number;
    /** Whether any ability can trigger through normal rules alone, not only via another card's effect. */
    naturalTrigger?: boolean;
    /** Whether every recurring ability is kept in check (a one-time trigger, hard limit, or paid cost). */
    repeatabilityRestricted?: boolean;
    /** all card types - feeds the strength calc only for characters, otherwise a plain filter */
    iconic?: boolean;
}

export type TriggerType =
    | "Action"
    | "Challenges Action"
    | "Dominance Action"
    | "Draw Action"
    | "Marshaling Action"
    | "Plot Action"
    | "Standing Action"
    | "Taxation Action"
    | "Interrupt"
    | "Reaction"
    | "Forced Reaction"
    | "Forced Interrupt"
    | "When Revealed";

export interface IDerivedKeyword {
    keyword: string;
    /** the "(X)" parameter, or the "except {trait}" suffix */
    value?: number | string;
}

/** Always server-computed from `card.text` via `deriveFields()` - never asked of, or sent by, a client */
export interface IDerivedFields {
    triggerTypes: TriggerType[];
    keywords: IDerivedKeyword[];
}

export const checklistRuleIds = [
    "strGuideline",
    "rewardFocus",
    "punishmentFocus",
    "loyaltyConsistency",
    "triggeredAbilityFocus",
    "repeatabilityControl",
    "plotBudget",
    "pivotPointBalance"
] as const;
export type ChecklistRuleId = (typeof checklistRuleIds)[number];

export const reactionTypes = ["like", "dislike", "ignore"] as const;
export type ReactionType = (typeof reactionTypes)[number];

export const archiveReasons = ["usedInProject", "duplicate", "rejected", "other"] as const;

/** Justification text per checklist rule, keyed by rule id - holds no pass/fail flag of its own,
 *  since that's always `checklistRules()`'s call, recomputed server-side at submit time. */
export type ChecklistJustifications = Partial<Record<ChecklistRuleId, string>>;

export type ArchiveReason = (typeof archiveReasons)[number];

export interface IArchivedInfo {
    reason: ArchiveReason;
    /** required when reason is "other" or "rejected" */
    details?: string;
    /** set when reason is "usedInProject" */
    project?: { code: string; number: number };
    archivedAt: Date;
    /** undefined for the system archive at project-initialise time */
    archivedBy?: string;
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
            /** shallow snapshot of watched fields as of the last sync, for the "what changed" edit message */
            lastSyncedSnapshot?: Record<string, unknown>;
        };
        /** Never client-writable (see the dedicated /:id/reaction routes) - lives under `_metadata`
         *  rather than top-level so reacting/approving never bumps `updated` (see stripAudit).
         *  `reactedAt`/`approvedAt` take `Date | string` rather than just `Date` - genuinely a `Date`
         *  server-side (Mongo's own BSON type) before Mongo serialises it, but only ever a plain ISO
         *  string once it crosses the wire as JSON, including the client's own optimistic patches
         *  (see api/index.ts) - Redux Toolkit's serializability check rejects a real `Date` instance
         *  in the store, and every consumer already re-wraps this in `new Date(...)` before calling
         *  any Date method, so the string form was always the one actually flowing through. */
        engagement?: {
            reactions: Record<string, { type: ReactionType; reactedAt: Date | string }>;
            approvedBy?: string;
            approvedAt?: Date | string;
        };
    };
    /** Present only once archived - see IArchivedInfo */
    archived?: IArchivedInfo;
    /** Card design */
    card: ICard;
    /** true until formally Submitted; only `card` needs to be valid while true */
    draft: boolean;
    questions: ISuggestionQuestions;
    /** always server-computed from card.text, never client-supplied */
    derived: IDerivedFields;
    /** justification text per rule the submitter has explained - see ChecklistJustifications */
    checklistJustifications: ChecklistJustifications;
    /** 0-many short callouts, each capped at PIVOT_POINT_MAX_LENGTH - see common/designGuidelines/pivotPoints */
    pivotPoints: string[];
    /** ThronesDB card codes */
    comparableCards: string[];
    /** ThronesDB card codes - printed cards only, same shape as comparableCards */
    combosWith: string[];
    notes?: string;
}

// Filter/sort-only field - a like tally computed server-side from the stored reactions map, never itself
// stored. Shared here (rather than declared only in suggestionsRepository.ts) so the client can also
// type filters/sorts against it when querying GET /suggestions.
export type ICardSuggestionFilterable = ICardSuggestion & { likes?: number };

// GET /suggestions extras handled by dedicated server-side middleware rather than the generic `filter`
// param - `_metadata.engagement.reactions` is a Joi `.pattern()`-keyed object (keyed by discord id), which
// the generic filter-schema deriver can't validate arbitrary keys against. The server resolves these
// against the *authenticated* principal's own discordId rather than trusting one from the client.
export type ISuggestionsListQuery = {
    unseen?: boolean;
    /** Comma-separated ReactionType values; absent/empty falls back to "hide ignored-by-me" */
    myReactions?: string;
};

/** Whether `viewerDiscordId` may see `suggestion` at all - a draft is only visible to the user who
 *  created it, with no permission able to override that. */
export function canViewSuggestion(suggestion: Pick<ICardSuggestion, "draft" | "user">, viewerDiscordId?: string) {
    return !suggestion.draft || suggestion.user.discordId === viewerDiscordId;
}

/** Shared by the server route (the actual gate) and the client (to hide the affordance) - mirrors
 *  artworkBlocker's shape. Says nothing about drafts; that falls out of canViewSuggestion alone. */
export function suggestionReactionBlockReason(
    suggestion: Pick<ICardSuggestion, "user">,
    reactorDiscordId?: string
): string | undefined {
    return !reactorDiscordId || suggestion.user.discordId === reactorDiscordId
        ? "You cannot react to your own suggestion"
        : undefined;
}

type SuggestionReactions = NonNullable<NonNullable<ICardSuggestion["_metadata"]>["engagement"]>["reactions"];

export function countReactionsByType(reactions: SuggestionReactions | undefined, type: ReactionType): number {
    return Object.values(reactions ?? {}).filter((entry) => entry.type === type).length;
}
