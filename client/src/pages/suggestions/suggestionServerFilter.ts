import { useMemo } from "react";
import { omit } from "lodash-es";
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
        ...enumBranches(factionNames, "faction", term),
        ...enumBranches(typeNames, "type", term)
    ];
}

const CASE_INSENSITIVE = "(?i)";

function isRegex(value: unknown): value is { $regex: string } {
    return !!value && typeof value === "object" && "$regex" in value;
}

// Both patterns must match - one pattern of lookaheads, since the filter has no `$and` to put two side by side
function bothPatterns(a: string, b: string): string | undefined {
    if (!a.startsWith(CASE_INSENSITIVE) || !b.startsWith(CASE_INSENSITIVE)) {
        return undefined;
    }
    const strip = (pattern: string) => pattern.slice(CASE_INSENSITIVE.length);
    return `${CASE_INSENSITIVE}^(?=[\\s\\S]*?${strip(a)})(?=[\\s\\S]*?${strip(b)})`;
}

// One field both the filter and the search speak to: their meeting, or undefined where nothing can satisfy both
function bothValues(filterValue: unknown, searchValue: unknown): { value: unknown } | undefined {
    if (filterValue === undefined) {
        return { value: searchValue };
    }
    if (isRegex(searchValue)) {
        const pattern = isRegex(filterValue) ? bothPatterns(filterValue.$regex, searchValue.$regex) : undefined;
        return pattern ? { value: { $regex: pattern } } : undefined;
    }
    // An exact value (a faction or type the term names) - only where the filter already allows it
    if (filterValue && typeof filterValue === "object" && "$in" in filterValue) {
        return (filterValue as { $in: unknown[] }).$in.includes(searchValue) ? { value: searchValue } : undefined;
    }
    return filterValue === searchValue ? { value: searchValue } : undefined;
}

// Search narrows what the filter already matches, so the two must hold together - a search branch never overrides a
// field the filter set. Undefined where the two can't both hold, which drops that branch (it could match nothing).
function mergeBranch(filterBranch: Record<string, unknown>, searchBranch: Branch): Record<string, unknown> | undefined {
    const merged = { ...filterBranch };
    for (const [key, fields] of Object.entries(searchBranch)) {
        const target = { ...(filterBranch[key] as Record<string, unknown> | undefined) };
        for (const [field, value] of Object.entries(fields)) {
            const both = bothValues(target[field], value);
            if (!both) {
                return undefined;
            }
            target[field] = both.value;
        }
        merged[key] = target;
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

// `unseen`/`myReactions` touch a Joi `.pattern()`-keyed object the generic filter deriver can't validate -
// GET /suggestions resolves these itself via dedicated query params against the caller's own principal.
export function suggestionListQueryExtras(value: SuggestionFilterValue): ISuggestionsListQuery {
    return {
        unseen: value.unseen || undefined,
        myReactions: value.myReactions && value.myReactions.length > 0 ? value.myReactions.join(",") : undefined,
        developed: value.developed || undefined
    };
}

export type SuggestionFilterContext = { currentUserId?: string };

export default function useSuggestionServerFilter(
    value: SuggestionFilterValue,
    search: string,
    context: SuggestionFilterContext
): SingleOrArray<Filter<ICardSuggestionFilterable>> | undefined {
    // unseen/myReactions must never reach cardExplodable - handled separately via
    // suggestionListQueryExtras; leaking either into `card.*` fails ICard filter validation.
    const {
        traits,
        mine,
        byUsers,
        approvedFilter,
        tags,
        iconic,
        intendedGameModes,
        legacy,
        archived,
        segments,
        ...rest
    } = value;
    const cardExplodable = omit(rest, ["unseen", "myReactions", "developed"]);
    const { currentUserId } = context;

    const combined = useMemo(() => {
        const base: Record<string, unknown> = {};

        // An empty `card` object must never be sent - isOperatorObject({}) is vacuously true, so it'd be
        // treated as a literal equality operator (`{ card: {} }`) matching no document at all.
        const cardFilter: Record<string, unknown> = { ...cardExplodable };
        setNonEmpty(cardFilter, "traits", traits);
        if (Object.keys(cardFilter).length > 0) {
            base.card = cardFilter;
        }

        if (mine && currentUserId) {
            base.createdBy = currentUserId;
        } else if (byUsers && byUsers.length > 0) {
            base.createdBy = byUsers;
        }

        // unseen/myReactions are NOT built here - see suggestionListQueryExtras above
        const engagement: Record<string, unknown> = {};
        if (approvedFilter === "only") {
            engagement.approvedBy = { $exists: true };
        } else if (approvedFilter === "none") {
            engagement.approvedBy = { $exists: false };
        } else if (approvedFilter === "awaiting") {
            base.draft = false;
            // Mirrors suggestionApprovalBlockReason - a legacy suggestion can never be approved
            base.legacy = { $exists: false };
            engagement.approvedBy = { $exists: false };
            base.likes = { $gte: SUGGESTION_APPROVAL_VOTE_THRESHOLD };
        }
        if (Object.keys(engagement).length > 0) {
            base._metadata = { engagement };
        }

        // `tags` is a plain top-level string-array field (denormalized from rewards/downsides), so it
        // filters exactly like `card.traits`'s own elementwise match.
        setNonEmpty(base, "tags", tags);

        const questions: Record<string, unknown> = {};
        if (iconic !== undefined) {
            questions.iconic = iconic;
        }
        // An array field filters elementwise, like `tags` - any of the modes picked
        setNonEmpty(questions, "intendedGameModes", intendedGameModes);
        if (Object.keys(questions).length > 0) {
            base.questions = questions;
        }

        // Completing a legacy suggestion removes the key rather than setting it false, and a boolean
        // filter only takes an exact value or $exists - so "not legacy" is the key being absent
        if (legacy !== undefined) {
            base.legacy = legacy ? true : { $exists: false };
        }

        // Always sent, never left for the server to decide - archived suggestions are hidden unless asked for
        base.archived = { $exists: !!archived };

        if (!segments || segments.length === 0) {
            return base as Explodable<ICardSuggestionFilterable>;
        }
        // One branch per pair, each carrying every other filter - the list endpoint matches any branch
        return segments.map(
            (segment) =>
                ({
                    ...base,
                    card: { ...cardFilter, faction: segment.faction, ...(segment.type && { type: segment.type }) }
                }) as Explodable<ICardSuggestionFilterable>
        );
    }, [
        cardExplodable,
        traits,
        mine,
        byUsers,
        approvedFilter,
        tags,
        iconic,
        intendedGameModes,
        legacy,
        archived,
        segments,
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
        const merged = base.flatMap((filterBranch) =>
            searchBranches
                .map((searchBranch) => mergeBranch(filterBranch, searchBranch))
                .filter((branch): branch is Record<string, unknown> => !!branch)
        );
        // Name and text are only ever regexes on both sides, so at least those branches always survive
        return merged as Filter<ICardSuggestionFilterable>[];
    }, [filters, search]);
}
