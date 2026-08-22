import { ChallengeIcon, challengeIcons, Faction, Icons, Type } from "common/models/cards";
import { escapeRegExp } from "common/utils";
import { CardFilterValue } from "../../components/data/cardFilter";
import {
    NumericFilterValue,
    NumericOperator,
    decodeNumericOperators,
    numericOperators
} from "../../components/data/filters/numeric";

// A small, self-contained codec between CardFilterValue's Mongo-shaped fields and flat URL params - kept
// separate from cardFilterDrawer's own decode/compose (which target its internal form state) so a filtered
// link can be shared without depending on that drawer being open or mounted.

function encodeArray(value?: unknown[]): string | undefined {
    return value && value.length > 0 ? value.join(",") : undefined;
}

function decodeArray(raw: string | null): string[] {
    return raw ? raw.split(",").filter(Boolean) : [];
}

// Same "(?i)" case-insensitive convention cardFilterDrawer's textFilter/decodeText use
function encodeText(value: unknown): string | undefined {
    if (value && typeof value === "object" && "$regex" in (value as object)) {
        const pattern = (value as { $regex: string }).$regex;
        return pattern.startsWith("(?i)") ? pattern.slice(4) : pattern;
    }
    return undefined;
}

function decodeText(raw: string | null): { $regex: string } | undefined {
    return raw ? { $regex: `(?i)${escapeRegExp(raw)}` } : undefined;
}

function encodeNumeric(value: unknown): string | undefined {
    const decoded = decodeNumericOperators(value);
    return decoded ? `${decoded.operator}:${decoded.value}` : undefined;
}

function decodeNumeric(raw: string | null) {
    if (!raw) {
        return undefined;
    }
    const [operator, rawValue] = raw.split(":");
    const value = Number(rawValue);
    if (Number.isNaN(value) || !["eq", "lt", "gt"].includes(operator)) {
        return undefined;
    }
    return numericOperators({ operator: operator as NumericOperator, value } as NumericFilterValue);
}

/** Every active field, flattened to string params - only fields actually set are included */
export function cardFilterToParams(filter: CardFilterValue): Record<string, string> {
    const params: Record<string, string> = {};
    const set = (key: string, value: string | undefined) => {
        if (value !== undefined) {
            params[key] = value;
        }
    };

    set("type", encodeArray(filter.type as string[] | undefined));
    set("faction", encodeArray(filter.faction as string[] | undefined));
    set("loyal", filter.loyal === undefined ? undefined : String(filter.loyal));
    set("unique", filter.unique === undefined ? undefined : String(filter.unique));
    set("icons", encodeArray(challengeIcons.filter((icon) => filter.icons?.[icon] === true)));
    set("cost", encodeNumeric(filter.cost));
    set("strength", encodeNumeric(filter.strength));
    set("income", encodeNumeric(filter.plotStats?.income));
    set("initiative", encodeNumeric(filter.plotStats?.initiative));
    set("claim", encodeNumeric(filter.plotStats?.claim));
    set("reserve", encodeNumeric(filter.plotStats?.reserve));
    set("name", encodeText(filter.name));
    set("text", encodeText(filter.text));
    set("flavor", encodeText(filter.flavor));
    set("designer", encodeText(filter.designer));
    set("traits", encodeArray(filter.traits));
    set("releases", encodeArray(filter.releases));
    return params;
}

export function cardFilterFromParams(params: URLSearchParams): CardFilterValue {
    const icons = decodeArray(params.get("icons")) as ChallengeIcon[];
    const iconsValue: Partial<Icons> = {};
    for (const icon of icons) {
        iconsValue[icon] = true;
    }

    const income = decodeNumeric(params.get("income"));
    const initiative = decodeNumeric(params.get("initiative"));
    const claim = decodeNumeric(params.get("claim"));
    const reserve = decodeNumeric(params.get("reserve"));
    const hasPlotStats = [income, initiative, claim, reserve].some((entry) => entry !== undefined);

    const types = decodeArray(params.get("type")) as Type[];
    const factions = decodeArray(params.get("faction")) as Faction[];
    const traits = decodeArray(params.get("traits"));
    const releases = decodeArray(params.get("releases"));
    const loyalRaw = params.get("loyal");
    const uniqueRaw = params.get("unique");

    return {
        type: types.length > 0 ? types : undefined,
        faction: factions.length > 0 ? factions : undefined,
        loyal: loyalRaw === "true" ? true : loyalRaw === "false" ? false : undefined,
        unique: uniqueRaw === "true" ? true : uniqueRaw === "false" ? false : undefined,
        icons: icons.length > 0 ? iconsValue : undefined,
        cost: decodeNumeric(params.get("cost")) as CardFilterValue["cost"],
        strength: decodeNumeric(params.get("strength")) as CardFilterValue["strength"],
        plotStats: hasPlotStats
            ? ({ income, initiative, claim, reserve } as NonNullable<CardFilterValue["plotStats"]>)
            : undefined,
        name: decodeText(params.get("name")),
        text: decodeText(params.get("text")),
        flavor: decodeText(params.get("flavor")),
        designer: decodeText(params.get("designer")),
        traits: traits.length > 0 ? traits : undefined,
        releases: releases.length > 0 ? releases : undefined
    };
}
