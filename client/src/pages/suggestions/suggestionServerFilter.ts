import { useMemo } from "react";
import { ICardSuggestionFilterable, ISuggestionsListQuery } from "common/models/cards";
import { Explodable, Filter, SingleOrArray, Sort } from "common/types";
import { escapeRegExp, factionNames, typeNames } from "common/utils";
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import useFilter from "../../hooks/useFilter";
import { SuggestionFilterValue } from "../../components/data/suggestionFilter";
import { SortOption } from "./suggestionSortOptions";

// Server-side replacement for useSuggestionFilterPredicate/matchesSearch (useFilteredSuggestionList.ts) -
// builds a Filter<ICardSuggestionFilterable> for GET /suggestions instead of evaluating in memory.

export const suggestionSortOrderBy: Record<SortOption, Sort<ICardSuggestionFilterable>> = {
    name: { card: { name: "asc" } },
    faction: { card: { faction: "asc", name: "asc" } },
    type: { card: { type: "asc", name: "asc" } },
    created: { created: "desc" },
    updated: { updated: "desc" },
    likes: { likes: "desc", card: { name: "asc" } }
};

type Branch = Record<string, Record<string, unknown>>;

function textBranch(path: "name" | "text" | "traits", pattern: string): Branch {
    return { card: { [path]: { $regex: pattern } } };
}

function enumBranches(map: Record<string, string>, field: "faction" | "type", term: string): Branch[] {
    const lower = term.toLowerCase();
    return Object.entries(map)
        .filter(([, label]) => label.toLowerCase().includes(lower))
        .map(([value]) => ({ card: { [field]: value } }));
}

function buildSearchBranches(term: string): Branch[] {
    const pattern = `(?i)${escapeRegExp(term)}`;
    return [
        textBranch("name", pattern),
        textBranch("text", pattern),
        textBranch("traits", pattern),
        { user: { displayname: { $regex: pattern } } },
        ...enumBranches(factionNames, "faction", term),
        ...enumBranches(typeNames, "type", term)
    ];
}

// Search branches only ever touch `card.*`/`user.*` one leaf at a time, so a shallow per-key merge (not a
// full deep merge) is enough to combine one with an existing advanced-filter branch without losing fields
function mergeBranch(filterBranch: Record<string, unknown>, searchBranch: Branch): Record<string, unknown> {
    const merged = { ...filterBranch };
    for (const [key, value] of Object.entries(searchBranch)) {
        merged[key] = { ...(filterBranch[key] as object | undefined), ...value };
    }
    return merged;
}

// Shared by every "any of these values" field below, so an empty selection is never sent as `field: []`
// (which would mean something different to Mongo than "no filter on this field")
function setNonEmpty(target: Record<string, unknown>, key: string, value: unknown[] | undefined): void {
    if (value && value.length > 0) {
        target[key] = value;
    }
}

// `unseen`/`myReactions` touch `_metadata.engagement.reactions`, a Joi `.pattern()`-keyed object (keyed
// by discord id) that the generic filter-schema deriver can't validate arbitrary keys against - GET
// /suggestions handles these itself via dedicated query params, resolved against the caller's own
// principal server-side, rather than through the generic `filter` param.
export function suggestionListQueryExtras(value: SuggestionFilterValue): ISuggestionsListQuery {
    return {
        unseen: value.unseen || undefined,
        myReactions: value.myReactions && value.myReactions.length > 0 ? value.myReactions.join(",") : undefined
    };
}

export type SuggestionFilterContext = { currentUserId?: string };

export default function useSuggestionServerFilter(
    value: SuggestionFilterValue,
    search: string,
    context: SuggestionFilterContext
): SingleOrArray<Filter<ICardSuggestionFilterable>> | undefined {
    const {
        traits,
        mine,
        byUsers,
        approvedFilter,
        rewardTypes,
        punishment,
        naturalTrigger,
        repeatabilityRestricted,
        iconic,
        ...cardExplodable
    } = value;
    const { currentUserId } = context;

    const combined = useMemo(() => {
        const base: Record<string, unknown> = {};

        // An empty `card` object must never be sent - isOperatorObject({}) is vacuously true (Object.keys([]).every
        // on an empty array), so buildFilterQuery/cartesianProduct would treat `{}` as a literal equality operator
        // rather than "nothing set here", producing `{ card: {} }` - a filter matching no document at all.
        const cardFilter: Record<string, unknown> = { ...cardExplodable };
        setNonEmpty(cardFilter, "traits", traits);
        if (Object.keys(cardFilter).length > 0) {
            base.card = cardFilter;
        }

        if (mine && currentUserId) {
            base.user = { discordId: currentUserId };
        } else if (byUsers && byUsers.length > 0) {
            base.user = { discordId: byUsers };
        }

        // unseen/myReactions are NOT built here - see suggestionListQueryExtras above
        const engagement: Record<string, unknown> = {};
        if (approvedFilter === "only") {
            engagement.approvedBy = { $exists: true };
        } else if (approvedFilter === "none") {
            engagement.approvedBy = { $exists: false };
        } else if (approvedFilter === "awaiting") {
            base.draft = false;
            engagement.approvedBy = { $exists: false };
            base.likes = { $gte: SUGGESTION_APPROVAL_VOTE_THRESHOLD };
        }
        if (Object.keys(engagement).length > 0) {
            base._metadata = { engagement };
        }

        const questions: Record<string, unknown> = {};
        setNonEmpty(questions, "rewardTypes", rewardTypes);
        setNonEmpty(questions, "punishment", punishment);
        if (naturalTrigger !== undefined) {
            questions.naturalTrigger = naturalTrigger;
        }
        if (repeatabilityRestricted !== undefined) {
            questions.repeatabilityRestricted = repeatabilityRestricted;
        }
        if (iconic !== undefined) {
            questions.iconic = iconic;
        }
        if (Object.keys(questions).length > 0) {
            base.questions = questions;
        }

        return base as Explodable<ICardSuggestionFilterable>;
    }, [
        cardExplodable,
        traits,
        mine,
        byUsers,
        approvedFilter,
        rewardTypes,
        punishment,
        naturalTrigger,
        repeatabilityRestricted,
        iconic,
        currentUserId
    ]);

    const filters = useFilter<ICardSuggestionFilterable>(combined);

    return useMemo(() => {
        const term = search.trim();
        if (!term) {
            return filters;
        }
        const searchBranches = buildSearchBranches(term);
        const base = filters && filters.length > 0 ? filters : [{}];
        return base.flatMap((filterBranch) =>
            searchBranches.map(
                (searchBranch) => mergeBranch(filterBranch, searchBranch) as Filter<ICardSuggestionFilterable>
            )
        );
    }, [filters, search]);
}
