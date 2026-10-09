import { SemanticVersion } from "common/utils";
import { factions, type Faction, type Type as CardType } from "./cards";
import type { ISlotOptions } from "./slots";
import { IAuditable, ReleaseDate } from "./shared";

export const types = ["cycle", "expansion"] as const;
export const githubStatuses = ["open", "closed"] as const;
export const releaseStatuses = ["planning", "confirming", "approved", "released"] as const;
export const articleStatuses = ["pending", "drafted", "published"] as const;
export type Type = (typeof types)[number];
export type Code = `${number}`;
export type ReleaseStatus = (typeof releaseStatuses)[number];

// Approval locks the design in, so there's nothing left for a release check to influence
export function areReleaseChecksClosed(status: ReleaseStatus) {
    return releaseStatuses.indexOf(status) >= releaseStatuses.indexOf("approved");
}

export interface IProject extends IAuditable {
    number: number;
    name: string;
    code: string;
    active: boolean;
    draft: boolean;
    description?: string;
    type: Type;
    script?: string; // TODO: Remove legacy script
    /** Server-maintained cache of slot counts per faction - not directly user-editable */
    cardCount: FactionCardCount;
    version: number;
    milestone?: number;
    mandateUrl?: string;
    formUrl?: string;
    emoji?: string;
    /** Discord ids of the people running this project - see projectOwnerPermissions */
    owners?: string[];
    /** Key into projectTemplates for this project's type - absent means custom, its slots set by hand */
    template?: string;
    releases: IProjectRelease[];
    _metadata?: {
        /** A draft project's planning forum - server-maintained */
        discord?: {
            forumUrl?: string;
            lastSynced?: Date;
        };
    };
}

export interface IProjectRelease extends IAuditable {
    code: string;
    name: string;
    /** Pack sequence within the project (1, 2, 3...); always 1 for expansions */
    number: number;
    /** Target pack size - derived from slots; drives placeholder count and printed-number derivation */
    capacity: number;
    /** Ordered faction allocations - positions 1..capacity are partitioned by faction in this order */
    slots: ReleaseSlotAllocation[];
    plannedDate?: ReleaseDate;
    /** Set by publish; once set, the whole release is immutable */
    releasedDate?: ReleaseDate;
    status: ReleaseStatus;
    article?: {
        url?: string;
        status: (typeof articleStatuses)[number];
    };
    _metadata?: {
        /** Release check announcement; messageUrl's presence means it has already been announced */
        discord?: {
            messageUrl?: string;
            lastSynced?: Date;
        };
        /** Data PR state for the release's own removal from the in-development pack file */
        github?: {
            data?: GithubPRMeta;
        };
    };
}

/** Computed completeness for a whole project. Never stored */
export interface IProjectProgress {
    /** Mean overall% of every card in the project; absent when it has no cards to average */
    overall?: number;
    cardCount: number;
}

/** Computed completeness for one release. Never stored */
export interface IReleaseProgress {
    code: string;
    /** Mean overall% of the cards assigned to this release */
    cards: number;
    /** How far the release's own status has progressed */
    status: number;
    overall: number;
    cardCount: number;
}

export type ReleaseSlotAllocation = {
    faction: Faction;
    count: number;
};

export type FactionCardCount = {
    baratheon: number;
    greyjoy: number;
    lannister: number;
    martell: number;
    thenightswatch: number;
    stark: number;
    targaryen: number;
    tyrell: number;
    neutral: number;
};

export type SlotCounts = Partial<FactionCardCount>;

// A project as it is saved - the counts are not stored, but opened, created or closed towards by the server
export type IProjectSave = IProject & { slotCounts?: SlotCounts };

/** A suggestion set aside in a draft project, to be drawn on for its slots - it stays pooled once placed */
export interface IPoolEntry {
    project: number;
    suggestion: string;
    /** Discord id of whoever pooled it */
    addedBy: string;
    added: Date;
}

export const CUSTOM_TEMPLATE = "custom";

/** Each faction's slots in order, one entry per slot - what it asks for, or {} where it asks nothing */
export type TemplateSlots = Record<Faction, ISlotOptions[]>;

export type ProjectTemplate = {
    name: string;
    description: string;
    /** The slots a project starts with - absent for custom, where they are set by hand */
    slots?: TemplateSlots;
};

const customTemplate: ProjectTemplate = { name: "Custom", description: "Set each faction's slots yourself" };

const character = (unique: boolean, min?: number, max?: number): ISlotOptions => ({
    conditions: [
        { stat: "type", types: ["character"] },
        { stat: "unique", value: unique },
        { stat: "cost", min, max }
    ]
});
const typed = (type: CardType, stat?: "cost" | "income", min?: number, max?: number): ISlotOptions => ({
    conditions: [{ stat: "type", types: [type] }, ...(stat ? [{ stat, min, max } as const] : [])]
});
const repeat = (count: number, slot: ISlotOptions) => Array.from({ length: count }, () => slot);

const standardFactionSlots: ISlotOptions[] = [
    character(true, 5),
    character(true, 3, 5),
    character(true, 0, 3),
    character(false, 5),
    character(false, 3, 5),
    character(false, 0, 3),
    typed("attachment", "cost", 1),
    typed("attachment"),
    typed("location", "cost", 1),
    typed("location"),
    ...repeat(2, typed("event"))
];

const standardNeutralSlots: ISlotOptions[] = [
    ...standardFactionSlots,
    ...repeat(2, typed("plot", "income", 5)),
    ...repeat(4, typed("plot", "income", 3, 4)),
    ...repeat(3, typed("plot", "income", 0, 3)),
    ...repeat(3, typed("agenda"))
];

const standardTemplate: ProjectTemplate = {
    name: "Standard",
    description: "120 slots with standard options",
    slots: Object.fromEntries(
        factions.map((faction) => [faction, faction === "neutral" ? standardNeutralSlots : standardFactionSlots])
    ) as TemplateSlots
};

// Per project type, as a cycle and an expansion are shaped differently - custom alone until the real ones are defined
export const projectTemplates: Record<Type, Record<string, ProjectTemplate>> = {
    cycle: { [CUSTOM_TEMPLATE]: customTemplate, standard: standardTemplate },
    expansion: { [CUSTOM_TEMPLATE]: customTemplate }
};

export function templateCounts(template: ProjectTemplate): FactionCardCount | undefined {
    const { slots } = template;
    return (
        slots &&
        (Object.fromEntries(Object.keys(slots).map((key) => [key, slots[key as Faction].length])) as FactionCardCount)
    );
}

export function projectTemplateOf(project: Pick<IProject, "type" | "template">): ProjectTemplate | undefined {
    return projectTemplates[project.type]?.[project.template ?? CUSTOM_TEMPLATE];
}

export interface GithubPRMeta {
    status?: (typeof githubStatuses)[number];
    mergedAt?: Date;
    pullRequestUrl?: string;
    lastSynced?: Date;
}

export const playtestingUpdateStates = ["pending", "partial", "playable"] as const;
export type PlaytestingUpdateState = (typeof playtestingUpdateStates)[number];

export interface IPlaytestingUpdate extends IAuditable {
    project: number;
    version: number;
    description?: string;
    cardChanges: Record<number, SemanticVersion>;
    _metadata?: {
        github?: {
            code?: GithubPRMeta;
            data?: GithubPRMeta;
        };
        /** Strictly only tracks the design & playtesting announcement, not the operations webhook post */
        discord?: {
            messageUrl?: string;
            lastSynced?: Date;
        };
    };
}
