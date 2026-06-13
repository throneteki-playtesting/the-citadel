import { UUID } from "crypto";
import * as Cards from "./models/cards";
import Permission from "./models/permissions";
import { DeckLink, DecklistLink, DeepPartial, SingleOrArray } from "./types";
import { Principal } from "./models/auth";
import { isEqual } from "lodash-es";
import { major, minor, patch, rcompare, valid } from "semver";

export type SemanticVersion = `${number}.${number}.${number}`;

export function maxEnum(o: object) {
    return Math.max(...Object.keys(o).filter(obj => !isNaN(parseInt(obj))).map(obj => parseInt(obj))) + 1;
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
    UUID: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
    ThronesDB: {
        DeckLink: /^https:\/\/thronesdb\.com\/deck\/view\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
        DeckListLink: /^https:\/\/thronesdb\.com\/decklist\/view\/\d+\/.*$/
    }
};

export function titleCase(value: string) {
    return value.split(" ")
        .map(w => w[0].toUpperCase() + w.substring(1).toLowerCase())
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
    let low = 0, high = arr.length;
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
export function asArray<T>(value: SingleOrArray<T>): T[]
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
    return Array.isArray(value) ? value[0] as T : value as T;
}

export const factionNames = {
    "baratheon": "House Baratheon",
    "greyjoy": "House Greyjoy",
    "lannister": "House Lannister",
    "martell": "House Martell",
    "thenightswatch": "The Night's Watch",
    "stark": "House Stark",
    "targaryen": "House Targaryen",
    "tyrell": "House Tyrell",
    "neutral": "Neutral"
};

export const typeNames = {
    "character": "Character",
    "location": "Location",
    "attachment": "Attachment",
    "event": "Event",
    "plot": "Plot",
    "agenda": "Agenda"
};

export const thronesColors = {
    "baratheon": "#e3d852",
    "greyjoy": "#1d7a99",
    "lannister": "#c00106",
    "martell": "#e89521",
    "thenightswatch": "#7a7a7a",
    "stark": "#cfcfcf",
    "targaryen": "#141414",
    "tyrell": "#509f16",
    "neutral": "#a99560",
    "income": "#ffd240",
    "initiative": "#bb9570",
    "claim": "#afafaf",
    "reserve": "#f0623f"
};

export const thronesFontColors = {
    "baratheon": "#000000",
    "greyjoy": "#ffffff",
    "lannister": "#ffffff",
    "martell": "#ffffff",
    "thenightswatch": "#ffffff",
    "stark": "#000000",
    "targaryen": "#ffffff",
    "tyrell": "#ffffff",
    "neutral": "#ffffff"
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
/**
     * Creates the full url for the specified request, converting query parameters into JSON
     */
export function buildUrl<T>(baseUrl: string, queryParameters?: T) {
    let url = baseUrl;
    if (queryParameters && Object.keys(queryParameters).length > 0) {
        const queryString = Object.entries(queryParameters)
            .filter(([, value]) => value != undefined)
            .map(([key, value]) => `${key}=${encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value))}`)
            .join("&");
        if (queryString) {
            url += "?" + queryString;
        }
    }
    return url;
}

export type ValidationStep<T extends Principal> = Permission | ((principal: T) => boolean);
export function validate<T extends Principal>(principal?: T, ...steps: ValidationStep<T>[]) {
    const { checks, permissions } = steps.reduce<{ checks: ((principal: T) => boolean)[], permissions: Permission[] }>(
        (results, step) => {
            if (typeof step === "function") {
                results.checks.push(step);
            } else {
                results.permissions.push(step);
            }
            return results;
        }, { checks: [], permissions: [] }
    );
    return hasPermission(principal, ...permissions) && checks.every((check) => !!principal && check(principal));
};

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

    return false;
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

export function renderPlaytestingCard(card: Cards.IPlaytestCard, watermark?: Cards.Watermark): Cards.IRenderCard
export function renderPlaytestingCard(card: DeepPartial<Cards.IPlaytestCard>, watermark?: Cards.Watermark): DeepPartial<Cards.IRenderCard>
export function renderPlaytestingCard(card: DeepPartial<Cards.IPlaytestCard>, watermark?: Cards.Watermark) {
    const versionText = !card.version || isPreview(card) ? "Preview" : `v${card.version}`;
    const codeText = card.code ?? (card.project && card.number ? parseCardCode(false, card.project, card.number) : undefined) ?? "Unknown Code";
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

export function renderCardSuggestion(suggestion: Cards.ICardSuggestion): Cards.IRenderCard
export function renderCardSuggestion(suggestion: DeepPartial<Cards.ICardSuggestion>): DeepPartial<Cards.IRenderCard>
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

export function suggestionToPlaytestCard(suggestion: Cards.ICardSuggestion, project: number, number: number, version: SemanticVersion = "0.0.0") {
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
    return card.version && !!valid(card.version) && major(card.version) === 1 && minor(card.version) === 0 && patch(card.version) === 0;
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

export function generatePlaytestingImageUrl(card: { project: number, number: number, version: SemanticVersion }) {
    return encodeURI(`https://throneteki.ams3.cdn.digitaloceanspaces.com/playtesting/${card.project}/${parseCardCode(false, card.project, card.number)}@${card.version}.png`);
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
    const isPlainObject = (val: unknown): val is object => val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date);
    return (Object.keys(updated) as (keyof T)[]).reduce((diff, key) => {
        const a = original[key];
        const b = updated[key];

        // Skip unchanged values
        if (isEqual(a, b)) return diff;

        // Recurse into plain objects; treat arrays, dates, and primitives as atomic
        diff[key] = (isPlainObject(a) && isPlainObject(b)
            ? getDiff(a, b)
            : b) as DeepPartial<T[keyof T]>;

        return diff;
    }, {} as Record<keyof T, DeepPartial<T[keyof T]>>) as DeepPartial<T>;
}

export function getMostRecent(cards: Cards.IPlaytestCard[]): Cards.IPlaytestCard | undefined {
    return [...cards].sort((a, b) => rcompare(a.version, b.version))[0];
}

export const isFaction = (code: Cards.Code | Cards.Faction): code is Cards.Faction => Cards.factions.includes(code as Cards.Faction);