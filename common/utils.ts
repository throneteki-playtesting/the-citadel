import { UUID } from "./models/shared";
import * as Cards from "./models/cards";
import Permission from "./models/permissions";
import { DeckLink, DecklistLink, DeepPartial, ISO8601String, SingleOrArray } from "./types";
import { Principal } from "./models/auth";
import { isEqual } from "lodash-es";
import { major, minor, patch, rcompare, valid } from "semver";
import type { IProject, ReleaseSlotAllocation } from "./models/projects";
import type { ISlot } from "./models/slots";
import { onboardingPriority, onboardingRoleConfig, OnboardingType } from "./models/onboarding";

export type SemanticVersion = `${number}.${number}.${number}`;

export function maxEnum(o: object) {
    return (
        Math.max(
            ...Object.keys(o)
                .filter((obj) => !isNaN(parseInt(obj)))
                .map((obj) => parseInt(obj))
        ) + 1
    );
}

export const Regex = {
    Card: {
        id: {
            full: /^\d+@\d+\.\d+\.\d+$/,
            optional: /^\d+(?:@\d+\.\d+\.\d+)?$/
        },
        code: /^\d{5}$/
    },
    Review: {
        id: {
            full: /^\w+@\d+@\d+\.\d+\.\d+$/
        }
    },
    SemanticVersion: /^\d+\.\d+\.\d+$/,
    ReleaseDate: /^\d{4}-\d{2}-\d{2}$/,
    UUID: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
    ThronesDB: {
        DeckLink:
            /^https:\/\/thronesdb\.com\/deck\/view\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
        DeckListLink: /^https:\/\/thronesdb\.com\/decklist\/view\/\d+\/.*$/
    }
};

export function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function titleCase(value: string) {
    return value
        .split(" ")
        .map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
        .join(" ");
}

export function cleanObject<T>(object: T) {
    for (const key in object) {
        if (object[key] === undefined) {
            delete object[key];
        }
    }

    return object;
}

export function distinct<T>(values: T[]) {
    return values.filter((value, index, array) => array.indexOf(value) === index);
}

export function pushSorted<T>(arr: T[], item: T, compareFn: (a: T, b: T) => number) {
    let low = 0,
        high = arr.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (compareFn(item, arr[mid]) < 0) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    arr.splice(low, 0, item);
}

/**
 * Ensures a possible single or array of objects are treated as an array of that object
 */
export function asArray<T>(value: SingleOrArray<T>): T[];
export function asArray<T>(value?: SingleOrArray<T>): T[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    return Array.isArray(value) ? value : [value as T];
}

/**
 * Ensures a possible single or array of objects are treated as a single object. If an array is passed in, the first element is returned
 */
export function asSingle<T>(value: SingleOrArray<T>) {
    if (value === undefined) {
        return undefined;
    }
    return Array.isArray(value) ? (value[0] as T) : (value as T);
}

export const factionNames = {
    baratheon: "House Baratheon",
    greyjoy: "House Greyjoy",
    lannister: "House Lannister",
    martell: "House Martell",
    thenightswatch: "The Night's Watch",
    stark: "House Stark",
    targaryen: "House Targaryen",
    tyrell: "House Tyrell",
    neutral: "Neutral"
};

export const typeNames = {
    character: "Character",
    location: "Location",
    attachment: "Attachment",
    event: "Event",
    plot: "Plot",
    agenda: "Agenda"
};

export const thronesColors = {
    baratheon: "#e3d852",
    greyjoy: "#1d7a99",
    lannister: "#c00106",
    martell: "#e89521",
    thenightswatch: "#7a7a7a",
    stark: "#cfcfcf",
    targaryen: "#141414",
    tyrell: "#509f16",
    neutral: "#a99560",
    income: "#ffd240",
    initiative: "#bb9570",
    claim: "#afafaf",
    reserve: "#f0623f"
};

export const thronesFontColors = {
    baratheon: "#000000",
    greyjoy: "#ffffff",
    lannister: "#ffffff",
    martell: "#ffffff",
    thenightswatch: "#ffffff",
    stark: "#000000",
    targaryen: "#ffffff",
    tyrell: "#ffffff",
    neutral: "#ffffff"
};

export const statementColors = {
    "statement-1": "#4338CA",
    "statement-2": "#818CF8",
    "statement-3": "#9B9B9B",
    "statement-4": "#2DD4BF",
    "statement-5": "#0D9488"
};

export function parseCardCode(isReleasable: boolean, project: number, number: number) {
    if (isReleasable) {
        return `${project}${number.toString().padStart(3, "0")}` as Cards.Code;
    } else {
        return `${project}${number + 500}` as Cards.Code;
    }
}
export function isPlaytestingCode(code: Cards.Code) {
    const number = parseInt(code);
    const remainder = Math.abs(number) % 1000;
    return remainder >= 500 && remainder <= 999;
}
/** Reverses parseCardCode(false, project, number) back to its project/number. */
export function parsePlaytestCode(code: Cards.Code): { project: number; number: number } | undefined {
    if (!isPlaytestingCode(code)) {
        return undefined;
    }
    const value = Math.abs(parseInt(code));
    return { project: Math.floor(value / 1000), number: (value % 1000) - 500 };
}
/** For each card in a deck's slots, finds the latest non-draft, non-released version at or before the deck's update time. */
export function resolveDeckCardVersions(
    slots: Record<string, number>,
    deckUpdated: ISO8601String,
    cards: Cards.IPlaytestCard[]
): Record<Cards.Code, SemanticVersion> {
    const deckUpdatedTime = new Date(deckUpdated).getTime();
    const result: Record<Cards.Code, SemanticVersion> = {};

    for (const code of Object.keys(slots)) {
        const parsed =
            parsePlaytestCode(code as Cards.Code) ??
            cards.find((card) => card.released && parseCardCode(true, card.project, card.released.number) === code);
        if (!parsed) {
            continue;
        }
        const candidates = cards.filter(
            (card) =>
                !card.draft &&
                card.project === parsed.project &&
                card.number === parsed.number &&
                card.updated.getTime() <= deckUpdatedTime
        );
        const latest = candidates.reduce<Cards.IPlaytestCard | undefined>(
            (best, card) => (!best || card.updated.getTime() > best.updated.getTime() ? card : best),
            undefined
        );
        if (latest && !latest.released) {
            result[parseCardCode(false, latest.project, latest.number)] = latest.version;
        }
    }

    return result;
}
/**
 * Creates the full url for the specified request, converting query parameters into JSON
 */
export function buildUrl<T>(baseUrl: string, queryParameters?: T) {
    let url = baseUrl;
    if (queryParameters && Object.keys(queryParameters).length > 0) {
        const queryString = Object.entries(queryParameters)
            .filter(([, value]) => value != undefined)
            .map(
                ([key, value]) =>
                    `${key}=${encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value))}`
            )
            .join("&");
        if (queryString) {
            url += "?" + queryString;
        }
    }
    return url;
}

/**
 * Guards against open redirects: only same-site relative paths are allowed, and not the auth pages themselves (to avoid redirect loops).
 */
export function isSafeRelativePath(path: string): boolean {
    return /^\/(?!\/)/.test(path) && path !== "/login" && path !== "/authRedirect";
}

export type ValidationStep<T extends Principal> = Permission | ((principal: T) => boolean);
export function validate<T extends Principal>(principal?: T, ...steps: ValidationStep<T>[]) {
    const { checks, permissions } = steps.reduce<{ checks: ((principal: T) => boolean)[]; permissions: Permission[] }>(
        (results, step) => {
            if (typeof step === "function") {
                results.checks.push(step);
            } else {
                results.permissions.push(step);
            }
            return results;
        },
        { checks: [], permissions: [] }
    );
    return hasPermission(principal, ...permissions) && checks.every((check) => !!principal && check(principal));
}

export function hasPermission<T extends Principal>(principal?: T, ...permissions: Permission[]) {
    if (permissions.length === 0) {
        return true;
    }

    if (!principal) {
        return false;
    }

    const includesPermission = (ps: Permission[]) => {
        return permissions.every((a) => ps.some((b) => a === b));
    };

    if (includesPermission(principal.permissions)) {
        return true;
    }

    if (principal.roles.some((role) => includesPermission(role.permissions))) {
        return true;
    }

    if (principal.defaultPermissions && includesPermission(principal.defaultPermissions)) {
        return true;
    }

    return false;
}

export function hasRole<T extends Principal>(principal: T | undefined, roleName: string) {
    return !!principal?.roles.some((role) => role.name === roleName);
}

export function isEligibleForOnboarding<T extends Principal>(principal: T | undefined, type: OnboardingType) {
    return hasRole(principal, onboardingRoleConfig[type].roleName);
}

export function isPlaytester<T extends Principal>(principal?: T) {
    return isEligibleForOnboarding(principal, "playtest");
}

/**
 * Picks which onboarding flow (if any) to surface after a role/login sync: either the user just gained
 * the flow's role this sync, or it's their first-ever login and they already hold it. When a user
 * qualifies for more than one, `onboardingPriority` decides which wins.
 */
export function determineOnboardingHint<T extends Principal>(input: {
    user: T;
    isFirstLogin: boolean;
    rolesGained: string[];
}): OnboardingType | undefined {
    const { user, isFirstLogin, rolesGained } = input;
    return onboardingPriority.find((type) => {
        const { roleName } = onboardingRoleConfig[type];
        return rolesGained.includes(roleName) || (isFirstLogin && hasRole(user, roleName));
    });
}

export function getBaseCardValues<T extends Cards.ICard>(card: DeepPartial<T>) {
    const {
        code,
        cost,
        deckLimit,
        designer,
        faction,
        flavor,
        icons,
        illustrator,
        loyal,
        name,
        plotStats,
        strength,
        traits,
        text,
        type,
        unique,
        quantity
    } = card;
    return {
        code,
        cost,
        deckLimit,
        designer,
        faction,
        flavor,
        icons,
        illustrator,
        loyal,
        name,
        plotStats,
        strength,
        traits,
        text,
        type,
        unique,
        quantity
    };
}

export type ReleaseTemplateDefinition = {
    name: string;
    description: string;
    /** Preset allocations; omitted for templates whose allocations are user-defined */
    slots?: ReleaseSlotAllocation[];
};

export const releaseTemplates: Record<"chapterPack" | "custom", ReleaseTemplateDefinition> = {
    chapterPack: {
        name: "Chapter Pack",
        description: "2 slots per faction, plus 4 neutral (20 cards)",
        slots: Cards.factions.map((faction) => ({ faction, count: faction === "neutral" ? 4 : 2 }))
    },
    custom: {
        name: "Custom",
        description: "Define & order each faction's slots yourself"
    }
};
export type ReleaseTemplate = keyof typeof releaseTemplates;

/** Matches allocations against template presets (ignoring empty factions); falls back to "custom" */
export function inferReleaseTemplate(slots?: ReleaseSlotAllocation[]): ReleaseTemplate {
    const normalized = (slots ?? []).filter((allocation) => allocation.count > 0);
    const preset = Object.entries(releaseTemplates).find(
        ([, template]) =>
            template.slots &&
            isEqual(
                template.slots.filter((allocation) => allocation.count > 0),
                normalized
            )
    );
    return (preset?.[0] as ReleaseTemplate) ?? "custom";
}

export function getReleaseCapacity(slots?: ReleaseSlotAllocation[]): number {
    return (slots ?? []).reduce((sum, allocation) => sum + allocation.count, 0);
}

/** Faction owning the given 1-based position under the release's ordered allocations, if any */
export function getPositionFaction(
    slots: ReleaseSlotAllocation[] | undefined,
    position: number
): Cards.Faction | undefined {
    let start = 1;
    for (const { faction, count } of slots ?? []) {
        if (position < start + count) {
            return position >= start ? faction : undefined;
        }
        start += count;
    }
    return undefined;
}

/** Sum of capacities of every release sequenced before the given release code */
export function getReleaseOffset(project: Pick<IProject, "releases">, code: string): number {
    const release = project.releases.find((r) => r.code === code);
    if (!release) {
        return 0;
    }
    return project.releases.filter((r) => r.number < release.number).reduce((sum, r) => sum + r.capacity, 0);
}

/** Derived preview of a slot's printed number; the permanent value is stamped on the card at publish (IPlaytestCard.released) */
export function getFinalCardNumber(
    project: Pick<IProject, "releases">,
    slot: Pick<ISlot, "release">
): number | undefined {
    if (!slot.release) {
        return undefined;
    }
    return getReleaseOffset(project, slot.release.code) + slot.release.position;
}

/** A slot is only truly released once its pack has been published */
export function isReleased(slot: Pick<ISlot, "release">): boolean {
    return !!slot.release?.released;
}

export function toJSONExportCard(card: Cards.IPlaytestCard, release?: { short: string; number: number }) {
    const imageUrl = release
        ? generateReleaseImageUrl(release.short, release.number, card.name)
        : card._metadata?.imageUrl;
    return {
        code: card.code,
        version: card.version,
        type: card.type,
        name: card.name,
        octgnId: null,
        quantity: card.quantity,
        unique: card.unique,
        faction: card.faction,
        loyal: card.loyal,
        cost: card.cost,
        icons: card.icons,
        strength: card.strength,
        plotStats: card.plotStats,
        traits: card.traits,
        text: card.text,
        flavor: card.flavor,
        deckLimit: card.deckLimit,
        illustrator: card.illustrator ?? "?",
        designer: card.designer,
        imageUrl
    };
}

export function renderPlaytestingCard(card: Cards.IPlaytestCard, watermark?: Cards.Watermark): Cards.IRenderCard;
export function renderPlaytestingCard(
    card: DeepPartial<Cards.IPlaytestCard>,
    watermark?: Cards.Watermark
): DeepPartial<Cards.IRenderCard>;
export function renderPlaytestingCard(card: DeepPartial<Cards.IPlaytestCard>, watermark?: Cards.Watermark) {
    const versionText = !card.version || isPreview(card) ? "Preview" : `v${card.version}`;
    const codeText =
        card.code ??
        (card.project && card.number ? parseCardCode(false, card.project, card.number) : undefined) ??
        "Unknown Code";
    return {
        ...getBaseCardValues(card),
        key: `${card.code}@${card.version}`,
        watermark: {
            top: watermark?.top ?? codeText,
            middle: watermark?.middle ?? versionText,
            bottom: watermark?.bottom ?? "Work In Progress"
        }
    } as DeepPartial<Cards.IRenderCard>;
}

export function renderCardSuggestion(suggestion: Cards.ICardSuggestion): Cards.IRenderCard;
export function renderCardSuggestion(suggestion: DeepPartial<Cards.ICardSuggestion>): DeepPartial<Cards.IRenderCard>;
export function renderCardSuggestion(suggestion: DeepPartial<Cards.ICardSuggestion>) {
    return {
        ...(suggestion.card ? getBaseCardValues(suggestion.card) : {}),
        key: suggestion.id,
        watermark: {
            top: suggestion.user?.displayname,
            middle: "Custom",
            bottom: "Card Suggestion"
        }
    } as DeepPartial<Cards.IRenderCard>;
}

export function suggestionToPlaytestCard(
    suggestion: Cards.ICardSuggestion,
    project: number,
    number: number,
    version: SemanticVersion = "0.0.0"
) {
    return {
        project,
        number,
        version,
        suggestionId: suggestion.id,
        ...suggestion.card
    } as Cards.IPlaytestCard;
}

export const abilityIcons: { [key: string]: string } = {
    military: "\ue605",
    intrigue: "\ue602",
    power: "\ue607",
    baratheon: "\ue600",
    greyjoy: "\ue601",
    lannister: "\ue603",
    martell: "\ue604",
    thenightswatch: "\ue606",
    stark: "\ue608",
    targaryen: "\ue609",
    tyrell: "\ue60a"
};

export const thronesIcons: { [key: string]: string } = {
    ...abilityIcons,
    neutral: "\ue612",
    unique: "\ue60b",
    character: "\ue60f",
    location: "\ue60e",
    attachment: "\ue60d",
    event: "\ue610",
    plot: "\ue60c",
    agenda: "\ue611"
};

export function isPreview(card: { version?: SemanticVersion }) {
    return card.version && !!valid(card.version) && major(card.version) === 0 && minor(card.version) === 0;
}
export function isInitial(card: { version?: SemanticVersion }) {
    return (
        card.version &&
        !!valid(card.version) &&
        major(card.version) === 1 &&
        minor(card.version) === 0 &&
        patch(card.version) === 0
    );
}

export function fuzzyMatch(expression: string, ...tests: string[]) {
    const regex = new RegExp(expression.split("").join(".*"), "i");
    for (const test of tests) {
        if (regex.test(test)) {
            return true;
        }
    }
    return false;
}

export function extractDeckIdentifier(url: DeckLink | DecklistLink) {
    const pattern = /https:\/\/thronesdb\.com\/(?:deck|decklist)\/view\/(?<target>[^/]+)/;
    const match = url.match(pattern);
    // If url is confirmed to be DeckLink or DecklistLink, this should guaranteed not be null
    // Still need to account for scenarios where that fails though
    if (!match) {
        return undefined;
    }
    const value = match!.groups!.target;

    return /^\d+$/.test(value) ? Number(value) : (value as UUID);
}

export function generatePlaytestingImageUrl(card: { project: number; number: number; version: SemanticVersion }) {
    return encodeURI(
        `https://throneteki.ams3.cdn.digitaloceanspaces.com/playtesting/${card.project}/${parseCardCode(false, card.project, card.number)}@${card.version}.png`
    );
}

export function generateReleaseImageUrl(short: string, number: number, name: string) {
    const safeName = name.replace(/[<>:"/\\|?*']/g, "").replace(/\s/g, "_");
    return encodeURI(`https://throneteki.ams3.cdn.digitaloceanspaces.com/packs/${short}/${number}_${safeName}.png`);
}

/**
 * Recursively compares two objects of the same type, returning only the fields
 * from `updated` that differ from `original`. Nested objects are diffed deeply;
 * arrays and dates are treated as atomic values.
 */
export function getDiff<T extends object>(original: T, updated: T): DeepPartial<T> {
    const isPlainObject = (val: unknown): val is object =>
        val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date);

    const diff = (Object.keys(updated) as (keyof T)[]).reduce(
        (diff, key) => {
            const a = original[key];
            const b = updated[key];

            // Skip unchanged values
            if (isEqual(a, b)) return diff;

            // Recurse into plain objects; treat arrays, dates, and primitives as atomic
            diff[key] = (isPlainObject(a) && isPlainObject(b) ? getDiff(a, b) : b) as DeepPartial<T[keyof T]>;

            return diff;
        },
        {} as Record<keyof T, DeepPartial<T[keyof T]>>
    );

    // Keys present in original but absent in updated were deleted — represent as {} for objects
    for (const key of Object.keys(original) as (keyof T)[]) {
        if (!(key in (updated as object))) {
            diff[key] = (isPlainObject(original[key]) ? {} : undefined) as DeepPartial<T[keyof T]>;
        }
    }

    return diff as DeepPartial<T>;
}

export function getMostRecent(cards: Cards.IPlaytestCard[]): Cards.IPlaytestCard | undefined {
    return [...cards].sort((a, b) => rcompare(a.version, b.version))[0];
}

export const isFaction = (code: Cards.Code | Cards.Faction): code is Cards.Faction =>
    Cards.factions.includes(code as Cards.Faction);
