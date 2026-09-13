import { AbilityType, ChallengeIcon, challengeIcons, Faction, Icons, ReactionType, Type } from "common/models/cards";
import { escapeRegExp } from "common/utils";
import { RewardType } from "common/designGuidelines/rewardTypes";
import { PunishmentType } from "common/designGuidelines/punishmentTypes";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import {
    NumericFilterValue,
    NumericOperator,
    decodeNumericOperators,
    numericOperators
} from "../../components/data/filters/numeric";

// Mirrors cardFilterUrl.ts's codec, extended for SuggestionFilterValue's own fields - kept separate
// from the drawer's own decode/compose so a filtered link can be shared without the drawer mounted.

function encodeArray(value?: unknown[]): string | undefined {
    return value && value.length > 0 ? value.join(",") : undefined;
}

function decodeArray(raw: string | null): string[] {
    return raw ? raw.split(",").filter(Boolean) : [];
}

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
export function suggestionFilterToParams(filter: SuggestionFilterValue): Record<string, string> {
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
    set("mine", filter.mine ? "true" : undefined);
    set("unseen", filter.unseen ? "true" : undefined);
    set("byUsers", encodeArray(filter.byUsers));
    set("draftFilter", filter.draftFilter);
    set("approvedFilter", filter.approvedFilter);
    set("myReactions", encodeArray(filter.myReactions));
    set("rewardTypes", encodeArray(filter.rewardTypes));
    set("punishment", encodeArray(filter.punishment));
    set("abilityTypes", encodeArray(filter.abilityTypes));
    set("iconic", filter.iconic === undefined ? undefined : String(filter.iconic));
    return params;
}

export function suggestionFilterFromParams(params: URLSearchParams): SuggestionFilterValue {
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

    const byUsers = decodeArray(params.get("byUsers"));
    const types = decodeArray(params.get("type")) as Type[];
    const factions = decodeArray(params.get("faction")) as Faction[];
    const traits = decodeArray(params.get("traits"));
    const rewardTypes = decodeArray(params.get("rewardTypes")) as RewardType[];
    const punishment = decodeArray(params.get("punishment")) as PunishmentType[];
    const abilityTypes = decodeArray(params.get("abilityTypes")) as AbilityType[];
    const loyalRaw = params.get("loyal");
    const uniqueRaw = params.get("unique");
    const iconicRaw = params.get("iconic");
    const draftFilterRaw = params.get("draftFilter");
    const approvedFilterRaw = params.get("approvedFilter");
    const myReactions = decodeArray(params.get("myReactions")).filter(
        (entry): entry is ReactionType => entry === "like" || entry === "dislike" || entry === "ignore"
    );
    const asDraftFilter = (raw: string | null) => (raw === "only" || raw === "none" ? raw : undefined);
    const asApprovalFilter = (raw: string | null) =>
        raw === "awaiting" || raw === "only" || raw === "none" ? raw : undefined;

    return {
        type: types.length > 0 ? types : undefined,
        faction: factions.length > 0 ? factions : undefined,
        loyal: loyalRaw === "true" ? true : loyalRaw === "false" ? false : undefined,
        unique: uniqueRaw === "true" ? true : uniqueRaw === "false" ? false : undefined,
        icons: icons.length > 0 ? iconsValue : undefined,
        cost: decodeNumeric(params.get("cost")) as SuggestionFilterValue["cost"],
        strength: decodeNumeric(params.get("strength")) as SuggestionFilterValue["strength"],
        plotStats: hasPlotStats
            ? ({ income, initiative, claim, reserve } as NonNullable<SuggestionFilterValue["plotStats"]>)
            : undefined,
        name: decodeText(params.get("name")),
        text: decodeText(params.get("text")),
        flavor: decodeText(params.get("flavor")),
        designer: decodeText(params.get("designer")),
        traits: traits.length > 0 ? traits : undefined,
        mine: params.get("mine") === "true" ? true : undefined,
        unseen: params.get("unseen") === "true" ? true : undefined,
        byUsers: byUsers.length > 0 ? byUsers : undefined,
        draftFilter: asDraftFilter(draftFilterRaw),
        approvedFilter: asApprovalFilter(approvedFilterRaw),
        myReactions: myReactions.length > 0 ? myReactions : undefined,
        rewardTypes: rewardTypes.length > 0 ? rewardTypes : undefined,
        punishment: punishment.length > 0 ? punishment : undefined,
        abilityTypes: abilityTypes.length > 0 ? abilityTypes : undefined,
        iconic: iconicRaw === "true" ? true : iconicRaw === "false" ? false : undefined
    };
}
