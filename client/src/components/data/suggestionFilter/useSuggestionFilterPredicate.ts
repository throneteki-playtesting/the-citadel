import { useMemo } from "react";
import { omit } from "lodash-es";
import { ICard, ICardSuggestion, ReactionType } from "common/models/cards";
import { Explodable, Filter, matchesFilter } from "common/types";
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import useFilter from "../../../hooks/useFilter";
import { SuggestionFilterValue } from "./types";

export type SuggestionFilterContext = {
    currentUserId?: string;
};

function countLikes(reactions?: Record<string, { type: ReactionType; reactedAt: Date | string }>) {
    return Object.values(reactions ?? {}).filter((entry) => entry.type === "like").length;
}

// Mirrors useCardFilterPredicate.ts - a pure client-side predicate, evaluated against the whole
// fetched suggestion set (no server-side pagination/filtering for this grid, same as ProjectContent).
export default function useSuggestionFilterPredicate(
    value: SuggestionFilterValue,
    context?: SuggestionFilterContext
): (suggestion: ICardSuggestion) => boolean {
    const {
        traits,
        mine,
        unseen,
        byUsers,
        approvedFilter,
        myReactions,
        tags,
        iconic,
        legacy,
        archived,
        segments,
        ...rest
    } = value;
    // `developed` needs the cards collection, so only the server can apply it - see suggestionListQueryExtras
    const explodable = omit(rest, ["developed"]);

    const filters = useFilter<ICard>(explodable as Explodable<ICard>);

    return useMemo(() => {
        return (suggestion: ICardSuggestion) => {
            const card = suggestion.card;
            if (filters && !filters.some((filter: Filter<ICard>) => matchesFilter(card, filter))) {
                return false;
            }
            if (
                segments &&
                segments.length > 0 &&
                !segments.some(
                    (segment) => segment.faction === card.faction && (!segment.type || segment.type === card.type)
                )
            ) {
                return false;
            }
            if (traits && traits.length > 0 && !traits.some((trait) => card.traits.includes(trait))) {
                return false;
            }
            if (mine && suggestion.createdBy !== context?.currentUserId) {
                return false;
            }
            if (byUsers && byUsers.length > 0 && !byUsers.includes(suggestion.createdBy)) {
                return false;
            }
            // No reaction from the current user at all (Ignore counts as "seen") - mirrors the /feed
            // route's own `unreacted` stat, excluding the viewer's own suggestions too.
            if (
                unseen &&
                (suggestion.createdBy === context?.currentUserId ||
                    suggestion._metadata?.engagement?.reactions?.[context?.currentUserId ?? ""])
            ) {
                return false;
            }
            if (approvedFilter === "only" && !suggestion._metadata?.engagement?.approvedBy) {
                return false;
            }
            if (approvedFilter === "none" && suggestion._metadata?.engagement?.approvedBy) {
                return false;
            }
            // Mirrors /feed's own `awaitingApproval` stat - submitted, not yet approved, and past the
            // vote threshold; not simply "not approved", which also matches an unvoted submission.
            if (
                approvedFilter === "awaiting" &&
                (suggestion.draft ||
                    suggestion.legacy ||
                    !!suggestion._metadata?.engagement?.approvedBy ||
                    countLikes(suggestion._metadata?.engagement?.reactions) < SUGGESTION_APPROVAL_VOTE_THRESHOLD)
            ) {
                return false;
            }
            const myOwnReaction = suggestion._metadata?.engagement?.reactions?.[context?.currentUserId ?? ""]?.type;
            if (myReactions && myReactions.length > 0) {
                if (!myOwnReaction || !myReactions.includes(myOwnReaction)) {
                    return false;
                }
            } else if (myOwnReaction === "ignore") {
                // Ignored-by-me is hidden unless explicitly asked for - the one field here that
                // changes behaviour by its ABSENCE, everything else only filters when set.
                return false;
            }
            if (tags && tags.length > 0 && !tags.some((tag) => suggestion.tags?.includes(tag))) {
                return false;
            }
            // `questions` is only guaranteed valid once fully submitted - a draft guarantees nothing
            // but `card`, so optional-chain every access rather than trust the type here.
            if (iconic !== undefined && !!suggestion.questions?.iconic !== iconic) {
                return false;
            }
            if (legacy !== undefined && !!suggestion.legacy !== legacy) {
                return false;
            }
            if (!!suggestion.archived !== !!archived) {
                return false;
            }
            return true;
        };
    }, [
        filters,
        traits,
        mine,
        unseen,
        byUsers,
        approvedFilter,
        myReactions,
        tags,
        iconic,
        legacy,
        archived,
        segments,
        context
    ]);
}
