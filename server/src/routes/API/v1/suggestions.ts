import * as Schemas from "common/models/schemas";
import { celebrate, Joi, Segments } from "@/celebrate";
import Permission from "common/models/permissions";
import asyncHandler from "express-async-handler";
import express, { NextFunction, Request, Response } from "express";
import { intersection, isEqual } from "lodash-es";
import {
    canViewSuggestion,
    cardMatchLabel,
    ICard,
    ICardSuggestion,
    ICardSuggestionFilterable,
    ISuggestionsListQuery,
    reactionTypes,
    suggestionApprovalBlockReason,
    suggestionReactionBlockReason
} from "common/models/cards";
import { dataService, thronesDbCardPoolService } from "@/services";
import { hasPermission, SemanticVersion, validate, withProjectOwnership } from "common/utils";
import { fitsSlot } from "common/models/slotConditions";
import { Filter } from "common/types";
import { validateRequest, PermissionErrorResponse } from "@/middleware/permissions";
import { Principal } from "common/models/auth";
import { getContext } from "@/middleware/context";
import { IGetRequest, IGetResponse } from "@/types";
import { StatusCodes } from "http-status-codes";
import { generateGetResponse, applyToFilter } from "@/utils";
import { ApiErrorResponse } from "@/errors";
import { getRequestSchema } from "@/schemas";
import { cardSnapshot, logActivity } from "@/services/activityLogService";
import { LogCategory } from "common/models/logs";
import { deriveFields } from "common/designGuidelines/deriveFields";
import { computeSuggestionTags } from "common/designGuidelines/suggestionTags";
import { checklistRules } from "common/designGuidelines/checklistRules";
import { ApiFieldError } from "@/types";
import { syncSuggestionForum } from "@/discord/forums/suggestionForum";
import {
    getPossiblyDevelopedSuggestionIds,
    getSuggestionCardMatches,
    invalidateSuggestionCardMatches
} from "@/services/suggestionCardMatches";
import {
    describeLegacyThread,
    fetchSuggestionForumThread,
    fetchThreadLikes,
    fetchThreadsStartedBy,
    isThreadMigrated,
    threadMatchesCard
} from "@/discord/forums/legacySuggestionThreads";

const router = express.Router();

async function getSuggestions(
    filter: IGetRequest<ICardSuggestionFilterable>["filter"],
    orderBy: IGetRequest<ICardSuggestionFilterable>["orderBy"],
    page: IGetRequest<ICardSuggestionFilterable>["page"],
    perPage: IGetRequest<ICardSuggestionFilterable>["perPage"]
): Promise<IGetResponse<ICardSuggestionFilterable>> {
    const [result, count] = await Promise.all([
        dataService.suggestions.read(filter, orderBy, page, perPage),
        dataService.suggestions.count(filter)
    ]);
    return generateGetResponse(result, count);
}

// Filter/sort-only field - computed server-side by SuggestionsRepository's virtualFields, never stored
const SuggestionFilterExtensions = { likes: Joi.number() };

const getQuerySchema = (
    getRequestSchema<ICardSuggestionFilterable>(Schemas.CardSuggestion.Full.keys(SuggestionFilterExtensions), {
        created: "desc"
    }) as Joi.ObjectSchema<IGetRequest<ICardSuggestionFilterable> & ISuggestionsListQuery>
).keys({
    // Handled by applyReactionVisibilityFilter below, not the generic `filter` param - see
    // ISuggestionsListQuery's comment for why these two can't go through the generic filter schema
    unseen: Joi.boolean(),
    myReactions: Joi.string(),
    // Handled by applyPossiblyDevelopedFilter below - it depends on the cards collection, not the suggestion itself
    developed: Joi.boolean(),
    // Handled by applySlotFitFilter below - the conditions are the slot's, read where they are kept
    fitsSlot: Joi.string().regex(/^\d+:\d+$/),
    // Handled by applyPooledFilter below - the pool is a project's own, read where it is kept
    pooledIn: Joi.number().integer()
});

// Resolves unseen/myReactions against the principal's discordId, merged into `req.query.filter` - NOT
// via applyToFilter's shallow spread, which would clobber approvedFilter's own `_metadata` condition.
const applyReactionVisibilityFilter = asyncHandler<
    unknown,
    unknown,
    unknown,
    IGetRequest<ICardSuggestionFilterable> & ISuggestionsListQuery
>(async (req, _res, next) => {
    const { principal } = getContext();
    const discordId = "discordId" in principal ? principal.discordId : undefined;
    if (!discordId) {
        next();
        return;
    }

    const { unseen, myReactions } = req.query;
    const reactionCondition = unseen
        ? { $exists: false }
        : myReactions
          ? { type: { $in: myReactions.split(",") } }
          : { type: { $ne: "ignore" } }; // default: ignored-by-me stays hidden unless asked for

    const branches = Array.isArray(req.query.filter) ? req.query.filter : [req.query.filter ?? {}];
    req.query.filter = branches.map((branch): Filter<ICardSuggestionFilterable> => {
        const existingMetadata = branch._metadata as Record<string, unknown> | undefined;
        const existingEngagement = existingMetadata?.engagement as Record<string, unknown> | undefined;
        return {
            ...branch,
            _metadata: {
                ...existingMetadata,
                engagement: { ...existingEngagement, reactions: { [discordId]: reactionCondition } }
            },
            ...(unseen ? { createdBy: { $ne: discordId } } : {})
        };
    });
    next();
});

// Archived suggestions (and filtering by archive reason) are only visible to MANAGE_SUGGESTIONS_ARCHIVE
// holders - everyone else's queries are silently narrowed to unarchived suggestions only.
const restrictArchivedVisibility = asyncHandler<unknown, unknown, unknown, IGetRequest<ICardSuggestionFilterable>>(
    async (req, _res, next) => {
        const { principal } = getContext();

        if (hasPermission(principal, Permission.MANAGE_SUGGESTIONS_ARCHIVE)) {
            return next();
        }

        // Asking for unarchived suggestions only is what everyone gets anyway - the client's filter always sends
        // it - so only a filter reaching for archived ones is refused
        const filters = Array.isArray(req.query.filter) ? req.query.filter : [req.query.filter];
        if (filters.some((f) => f?.archived !== undefined && !isEqual(f.archived, { $exists: false }))) {
            throw new PermissionErrorResponse();
        }

        req.query.filter = applyToFilter(req.query.filter, { archived: { $exists: false } });
        next();
    }
);

// Applies canViewSuggestion's rule to every read - "not a draft, OR my own draft" is an OR, so each
// existing filter branch expands into up to two. Used only by the single-suggestion route (GET /:id).
const restrictDraftVisibility = asyncHandler<unknown, unknown, unknown, IGetRequest<ICardSuggestionFilterable>>(
    async (req, _res, next) => {
        const { principal } = getContext();
        const discordId = "discordId" in principal ? principal.discordId : undefined;

        const branches = Array.isArray(req.query.filter) ? req.query.filter : [req.query.filter ?? {}];
        req.query.filter = branches.flatMap((branch): Filter<ICardSuggestion>[] => {
            const visible: Filter<ICardSuggestion>[] = [{ ...branch, draft: false }];
            if (discordId) {
                visible.push({ ...branch, draft: true, createdBy: discordId });
            }
            return visible;
        });
        next();
    }
);

// GET / (list) never mixes drafts into the general pool, except a branch explicitly asking
// `draft: true` (the "My Drafts" modal) - and even then, narrowed to the caller's own.
const restrictListDraftVisibility = asyncHandler<unknown, unknown, unknown, IGetRequest<ICardSuggestionFilterable>>(
    async (req, _res, next) => {
        const { principal } = getContext();
        const discordId = "discordId" in principal ? principal.discordId : undefined;

        const branches = Array.isArray(req.query.filter) ? req.query.filter : [req.query.filter ?? {}];
        req.query.filter = branches.map((branch): Filter<ICardSuggestion> => {
            if (branch.draft === true && discordId) {
                return { ...branch, draft: true, createdBy: discordId };
            }
            return { ...branch, draft: false };
        });
        next();
    }
);

type SuggestionEngagement = NonNullable<NonNullable<ICardSuggestion["_metadata"]>["engagement"]>;
const EMPTY_ENGAGEMENT: SuggestionEngagement = { reactions: {} };

// Always server-computed from `card.text` - never trusted from the client regardless of what a
// request body claims it to be.
function forceDerived(req: Request, _res: Response, next: NextFunction) {
    req.body.derived = deriveFields(req.body?.card?.text ?? "");
    next();
}

// Same server-computed convention as forceDerived - a settings save bulk-resyncs `tags` separately
// (resyncSuggestionTags), but the suggestion's own reward/punishment picks changing is only caught here.
const forceTags = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const settings = await dataService.settings.getByType("suggestions");
    req.body.tags = computeSuggestionTags(
        req.body?.questions ?? {},
        settings?.rewardTypes ?? [],
        settings?.punishmentTypes ?? []
    );
    next();
});

// `legacy` and `_metadata.discord.legacyUrl` are only ever set server-side (the spreadsheet import, and
// a migration from an old forum thread), so every save carries the stored values over whatever the body says
function applyServerOwnedFields(body: ICardSuggestion, existing?: ICardSuggestion) {
    delete body.legacy;
    if (existing?.legacy) {
        body.legacy = true;
    }
    const legacyUrl = existing?._metadata?.discord?.legacyUrl;
    const discord = { ...body._metadata?.discord };
    delete discord.legacyUrl;
    body._metadata = { ...body._metadata, discord: legacyUrl ? { ...discord, legacyUrl } : discord };
}

// Create (POST /) always starts a fresh draft with no engagement yet - there's nothing to preserve
// or clear, since nothing has been submitted for anyone to react to or approve.
function prepareCreateBody(req: Request, _res: Response, next: NextFunction) {
    req.body.draft = true;
    applyServerOwnedFields(req.body);
    req.body._metadata = { ...req.body._metadata, engagement: EMPTY_ENGAGEMENT };
    next();
}

// PUT /:id/draft stays a draft - nothing to clear (never reacted to/approved), so persisted
// engagement just carries over untouched, discarding whatever the client's body contained.
function prepareDraftSaveBody(req: Request, res: Response, next: NextFunction) {
    const existing = res.locals.suggestion as ICardSuggestion;
    req.body.draft = true;
    applyServerOwnedFields(req.body, existing);
    req.body._metadata = { ...req.body._metadata, engagement: existing._metadata?.engagement ?? EMPTY_ENGAGEMENT };
    next();
}

// Clears reactions/approval, as an edit invalidates them - except when completing a legacy suggestion, whose
// reactions were given to the card as it already stood. Completing is also what clears `legacy`.
function prepareLiveSaveBody(req: Request, res: Response, next: NextFunction) {
    const existing = res.locals.suggestion as ICardSuggestion;
    req.body.draft = false;
    applyServerOwnedFields(req.body, existing);
    delete req.body.legacy;
    const reactions = existing.legacy ? (existing._metadata?.engagement?.reactions ?? {}) : {};
    req.body._metadata = { ...req.body._metadata, engagement: { reactions } };
    next();
}

// A migration (POST /migrate/:threadId) is submitted straight away, never left as a draft - its old thread
// already had people reacting to it, so it gets a thread of its own to carry on in
function prepareMigrateBody(req: Request, _res: Response, next: NextFunction) {
    req.body.draft = false;
    applyServerOwnedFields(req.body);
    req.body._metadata = { ...req.body._metadata, engagement: EMPTY_ENGAGEMENT };
    next();
}

// Reactions given in the Citadel stand - an old thread's 👍s only fill in for people who haven't reacted here
// yet. Nobody's own suggestion counts.
function mergeReactions(
    designerId: string,
    reactions: SuggestionEngagement["reactions"] | undefined,
    threadLikes: string[]
): SuggestionEngagement["reactions"] {
    const merged: SuggestionEngagement["reactions"] = { ...reactions };
    delete merged[designerId];
    const now = new Date();
    for (const discordId of threadLikes) {
        if (discordId !== designerId && !merged[discordId]) {
            merged[discordId] = { type: "like", reactedAt: now };
        }
    }
    return merged;
}

// Only its own starter can migrate a thread, and only once - the same checks whichever route is asking
async function loadLegacyThread(threadId: string, designerId: string) {
    const thread = await fetchSuggestionForumThread(threadId);
    if (!thread) {
        throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", "That is not a thread of the suggestion forum");
    }
    const legacy = describeLegacyThread(thread);
    if (legacy.ownerId !== designerId) {
        throw new ApiErrorResponse(
            StatusCodes.FORBIDDEN,
            "Validation Error",
            "Only the person who started a thread can migrate it"
        );
    }
    if (await isThreadMigrated(legacy.url)) {
        throw new ApiErrorResponse(
            StatusCodes.BAD_REQUEST,
            "Validation Error",
            "This thread has already been migrated to the Citadel"
        );
    }
    return { thread, legacy };
}

// Recomputes checklistRules() server-side and requires justification for every rule failing - not
// declared in the Joi schema, since that depends on card/questions/derived/pivotPoints together.
async function assertChecklistJustified(suggestion: ICardSuggestion) {
    const [plotMedian, settings] = await Promise.all([
        thronesDbCardPoolService.getPlotMedianForCardType(suggestion.card.type),
        dataService.settings.getByType("suggestions")
    ]);
    const results = checklistRules({
        card: suggestion.card,
        questions: suggestion.questions,
        derived: suggestion.derived,
        pivotPoints: suggestion.pivotPoints ?? [],
        plotMedian,
        rewardTypes: settings?.rewardTypes ?? [],
        punishmentTypes: settings?.punishmentTypes ?? [],
        loyaltyTags: settings?.loyaltyTags ?? []
    });

    const fields: ApiFieldError[] = results
        .filter((result) => result.status === "warn" && !suggestion.checklistJustifications?.[result.rule]?.trim())
        .map((result) => ({
            path: `checklistJustifications.${result.rule}`,
            message: "Is required"
        }));
    if (fields.length > 0) {
        throw new ApiErrorResponse(
            StatusCodes.BAD_REQUEST,
            "Validation Error",
            `checklistJustifications: ${fields.map((f) => f.message).join(", ")}`,
            undefined,
            fields
        );
    }
}

function notFoundSuggestion(id: string): never {
    throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", `Suggestion with id ${id} does not exist`);
}

// Throws for a principal without a discordId (eg. an API key) rather than letting one through
// with `undefined` silently standing in for "everyone"/"no one" further down.
function requireDiscordId(principal: Principal): string {
    if (!("discordId" in principal)) {
        throw new PermissionErrorResponse();
    }
    return principal.discordId;
}

// An archived suggestion is a record of a design that went somewhere, or was set aside - editing it would
// rewrite that record. It can still be deleted.
function rejectArchived(_req: Request, res: Response, next: NextFunction) {
    if ((res.locals.suggestion as ICardSuggestion).archived) {
        throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Validation Error", "Archived suggestions can't be edited");
    }
    next();
}

// asyncHandler-wrapped, not a plain async function - Express v4 never awaits/catches a bare async
// middleware's promise, so a throw inside one becomes an unhandled rejection instead of a next(err).
const loadSuggestionForOwnershipCheck = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const [suggestion] = await dataService.suggestions.read({ id });
    if (!suggestion) {
        notFoundSuggestion(id);
    }
    res.locals.suggestion = suggestion;
    next();
});

function requiresEditOrOwnership(principal: Principal, req: Request, res: Response) {
    const suggestion = res.locals.suggestion as ICardSuggestion;
    return (
        hasPermission(principal, Permission.EDIT_SUGGESTIONS) ||
        validate(
            principal,
            Permission.MAKE_SUGGESTIONS,
            (principal) => "discordId" in principal && principal.discordId === suggestion.createdBy
        )
    );
}

// Narrows to legacy suggestions a project card may already have been developed from - worked out against every
// card, so the suggestions' ids are what reaches the filter. Only for those who can archive them as that card.
const applyPossiblyDevelopedFilter = asyncHandler<
    unknown,
    unknown,
    unknown,
    IGetRequest<ICardSuggestionFilterable> & ISuggestionsListQuery
>(async (req, _res, next) => {
    if (!req.query.developed) {
        next();
        return;
    }
    if (!hasPermission(getContext().principal, Permission.MANAGE_SUGGESTIONS_ARCHIVE)) {
        throw new PermissionErrorResponse();
    }
    const ids = await getPossiblyDevelopedSuggestionIds();
    req.query.filter = applyToFilter(req.query.filter, { id: { $in: ids } });
    next();
});

// Narrows to suggestions which fit a slot, by the rule that warns of a misfit once a card is in it. X and "-" pass
// any range, which a query cannot say - so every suggestion of the slot's faction is asked, and the ids filtered on
const applySlotFitFilter = asyncHandler<
    unknown,
    unknown,
    unknown,
    IGetRequest<ICardSuggestionFilterable> & ISuggestionsListQuery
>(async (req, res, next) => {
    if (!req.query.fitsSlot) {
        next();
        return;
    }
    const [projectNumber, number] = req.query.fitsSlot.split(":").map(Number);
    const [[project], [slot]] = await Promise.all([
        dataService.projects.read({ number: projectNumber }),
        dataService.slots.read({ project: projectNumber, number })
    ]);
    if (!project || !slot) {
        throw new ApiErrorResponse(
            StatusCodes.NOT_FOUND,
            "Not Found",
            `Slot #${number} does not exist for project #${projectNumber}`
        );
    }
    if (!hasPermission(withProjectOwnership(getContext().principal, project), Permission.READ_SLOTS)) {
        throw new PermissionErrorResponse();
    }
    const candidates = await dataService.suggestions.read({ card: { faction: slot.faction } });
    const ids = candidates.filter((suggestion) => fitsSlot(slot, suggestion.card)).map((suggestion) => suggestion.id);
    res.locals.idSets = [...(res.locals.idSets ?? []), ids];
    next();
});

// Narrows to a draft project's pool, which only those who can draft in the project may see
const applyPooledFilter = asyncHandler<
    unknown,
    unknown,
    unknown,
    IGetRequest<ICardSuggestionFilterable> & ISuggestionsListQuery
>(async (req, res, next) => {
    if (req.query.pooledIn === undefined) {
        next();
        return;
    }
    const [project] = await dataService.projects.read({ number: req.query.pooledIn });
    if (!project) {
        throw new ApiErrorResponse(StatusCodes.NOT_FOUND, "Not Found", `Project #${req.query.pooledIn} does not exist`);
    }
    if (!hasPermission(withProjectOwnership(getContext().principal, project), Permission.CREATE_CARDS)) {
        throw new PermissionErrorResponse();
    }
    const pooled = await dataService.pools.read({ project: project.number });
    res.locals.idSets = [...(res.locals.idSets ?? []), pooled.map((entry) => entry.suggestion)];
    next();
});

// What the filters above each allow, applied together as the suggestions which every one of them allows
const applyIdSets = asyncHandler<
    unknown,
    unknown,
    unknown,
    IGetRequest<ICardSuggestionFilterable> & ISuggestionsListQuery
>(async (req, res, next) => {
    const sets = (res.locals.idSets ?? []) as string[][];
    if (sets.length > 0) {
        req.query.filter = applyToFilter(req.query.filter, { id: { $in: intersection(...sets) } });
    }
    next();
});

// Read suggestions
router.get(
    "/",
    validateRequest(Permission.READ_SUGGESTIONS),
    celebrate({
        [Segments.QUERY]: getQuerySchema
    }),
    restrictArchivedVisibility,
    restrictListDraftVisibility,
    applyReactionVisibilityFilter,
    applyPossiblyDevelopedFilter,
    applySlotFitFilter,
    applyPooledFilter,
    applyIdSets,
    asyncHandler<unknown, unknown, unknown, IGetRequest<ICardSuggestionFilterable>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getSuggestions(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Feed - declared before /:id, or the param route would swallow it as a suggestion id

// 10 = the Recent Suggestions rail's widest breakpoint (5 columns) times its 2-row client-side cap.
const FEED_RAIL_SIZE = 10;
const FEED_WORKING_SET_SIZE = 200; // newest/most-recently-updated suggestions the rail picks from, past ones ignored

router.get(
    "/feed",
    validateRequest(Permission.READ_SUGGESTIONS),
    asyncHandler(async (_req, res) => {
        const { principal } = getContext();
        const discordId = "discordId" in principal ? principal.discordId : undefined;
        const canManageArchive = hasPermission(principal, Permission.MANAGE_SUGGESTIONS_ARCHIVE);

        const baseFilter = canManageArchive ? {} : { archived: { $exists: false } as const };
        // Legacy suggestions sit in the rail by the date they reached the design team's spreadsheet, so they only
        // show here when that was recent
        const [newest, stats, possiblyDeveloped] = await Promise.all([
            dataService.suggestions.read(
                { ...baseFilter, draft: false },
                { updated: "desc" },
                1,
                FEED_WORKING_SET_SIZE
            ),
            // Counted across the whole collection, not the working set above - with the legacy import, a total
            // taken from any bounded slice would stop at the slice's size
            dataService.suggestions.feedStats(discordId),
            // Only worth working out for those who can act on it
            canManageArchive ? getPossiblyDevelopedSuggestionIds().then((ids) => ids.length) : 0
        ]);

        // Ignore is "seen, nothing to say" - already-ignored suggestions don't resurface in the rail.
        // Stats are unaffected: they're aggregate counts, not a personalised "look at this" list.
        const recentCandidates = discordId
            ? newest.filter((s) => s._metadata?.engagement?.reactions?.[discordId]?.type !== "ignore")
            : newest;

        res.status(StatusCodes.OK).json({
            recent: recentCandidates.slice(0, FEED_RAIL_SIZE), // already sorted `updated: desc`
            stats: { ...stats, possiblyDeveloped }
        });
    })
);

// Backs checklistRules()'s plot budget rule - reads the already-cached ThronesDB pool rather than
// hitting ThronesDB itself. Declared before /:id, or the param route would swallow it as a suggestion id.
router.get(
    "/stats/plot-median",
    validateRequest(Permission.READ_SUGGESTIONS),
    asyncHandler(async (_req, res) => {
        const median = await thronesDbCardPoolService.getPlotMedian();
        res.status(StatusCodes.OK).json({ median });
    })
);

// Full-universe traits/submitters for the advanced filter drawer, aggregated over the whole collection.
// Redis-cached with a short TTL, or it's a full-collection scan every time the drawer opens.
const FILTER_OPTIONS_REDIS_KEY = "suggestions:filterOptions";
const FILTER_OPTIONS_CACHE_SECONDS = 60;

router.get(
    "/filter-options",
    validateRequest(Permission.READ_SUGGESTIONS),
    asyncHandler(async (_req, res) => {
        const cached = await dataService.redis.get(FILTER_OPTIONS_REDIS_KEY);
        if (cached) {
            res.status(StatusCodes.OK).json(JSON.parse(String(cached)));
            return;
        }

        const options = await dataService.suggestions.distinctFilterOptions();
        await dataService.redis.set(FILTER_OPTIONS_REDIS_KEY, JSON.stringify(options), {
            EX: FILTER_OPTIONS_CACHE_SECONDS
        });
        res.status(StatusCodes.OK).json(options);
    })
);

// What the migrate wizard needs to know about an old thread (reached from Discord's /migrate), along with
// the caller's own legacy suggestions that look like the same card - one of which they may merge into it
router.get(
    "/migrate/:threadId",
    validateRequest(Permission.MAKE_SUGGESTIONS),
    celebrate({ [Segments.PARAMS]: { threadId: Joi.string().required() } }),
    asyncHandler<{ threadId: string }, unknown, unknown, unknown>(async (req, res) => {
        const discordId = requireDiscordId(getContext().principal);
        const { thread, legacy } = await loadLegacyThread(req.params.threadId, discordId);
        const [likes, legacySuggestions] = await Promise.all([
            fetchThreadLikes(thread),
            dataService.suggestions.read({
                createdBy: discordId,
                draft: false,
                legacy: true,
                archived: { $exists: false }
            })
        ]);

        res.status(StatusCodes.OK).json({
            thread: { ...legacy, likes: likes.length },
            candidates: legacySuggestions.filter((suggestion) => threadMatchesCard(legacy, suggestion.card))
        });
    })
);

// Submits a suggestion for an old thread - carrying over its date and 👍s, and the reactions of a merged
// legacy suggestion, which is deleted - then posts it a new thread and closes the old one (see sync)
router.post(
    "/migrate/:threadId",
    validateRequest(Permission.MAKE_SUGGESTIONS),
    celebrate({
        [Segments.PARAMS]: { threadId: Joi.string().required() },
        [Segments.QUERY]: { mergeId: Joi.string() }
    }),
    forceDerived,
    forceTags,
    prepareMigrateBody,
    celebrate({ [Segments.BODY]: Schemas.CardSuggestion.Full }),
    asyncHandler<{ threadId: string }, unknown, ICardSuggestion, { mergeId?: string }>(async (req, res) => {
        const discordId = requireDiscordId(getContext().principal);
        const { thread, legacy } = await loadLegacyThread(req.params.threadId, discordId);

        const { mergeId } = req.query;
        const [merging] = mergeId ? await dataService.suggestions.read({ id: mergeId }) : [];
        if (mergeId && (!merging || merging.createdBy !== discordId || !merging.legacy || merging.archived)) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Validation Error",
                "Only one of your own unarchived legacy suggestions can be merged"
            );
        }

        await assertChecklistJustified(req.body);

        const likes = await fetchThreadLikes(thread);
        const body = req.body;
        body._metadata = {
            ...body._metadata,
            discord: { legacyUrl: legacy.url },
            engagement: { reactions: mergeReactions(discordId, merging?._metadata?.engagement?.reactions, likes) }
        };

        let suggestion = await dataService.suggestions.create(body, false);
        suggestion = (await dataService.suggestions.setCreated(suggestion.id!, legacy.createdAt)) ?? suggestion;
        if (merging) {
            await dataService.suggestions.destroy({ id: merging.id }, false);
            await dataService.pools.destroy({ suggestion: merging.id });
        }
        suggestion = await dataService.suggestions.sync(suggestion);

        await logActivity(
            LogCategory.SUGGESTION,
            "suggestion.migrated",
            "<principal> migrated suggestion <suggestion> from a forum thread",
            { context: { suggestion: cardSnapshot(suggestion.id, suggestion.card) } }
        );

        res.status(StatusCodes.OK).json(suggestion);
    })
);

router.get(
    "/:id",
    validateRequest(Permission.READ_SUGGESTIONS),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        [Segments.QUERY]: getQuerySchema
    }),
    restrictDraftVisibility,
    asyncHandler<{ id: string }, unknown, unknown, IGetRequest<ICardSuggestionFilterable>>(async (req, res) => {
        const { id } = req.params;
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getSuggestions(applyToFilter(filter, { id }), orderBy, page, perPage);
        const [suggestion] = response.items;
        res.status(StatusCodes.OK).json(suggestion);
    })
);

// The designer's old forum threads matching this legacy suggestion's card, for PUT /:id?legacyThread= to carry
// over. The card is passed in, as completing it may have renamed or retyped it.
router.get(
    "/:id/thread-matches",
    validateRequest(
        (principal) =>
            hasPermission(principal, Permission.EDIT_SUGGESTIONS) ||
            hasPermission(principal, Permission.MAKE_SUGGESTIONS)
    ),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        [Segments.QUERY]: { name: Joi.string(), faction: Joi.string(), type: Joi.string() }
    }),
    loadSuggestionForOwnershipCheck,
    validateRequest(requiresEditOrOwnership),
    asyncHandler<{ id: string }, unknown, unknown, Partial<Pick<ICard, "name" | "faction" | "type">>>(
        async (req, res) => {
            const suggestion = res.locals.suggestion as ICardSuggestion;
            if (!suggestion.legacy) {
                res.status(StatusCodes.OK).json([]);
                return;
            }

            const card = { ...suggestion.card, ...req.query };
            const matching = (await fetchThreadsStartedBy(suggestion.createdBy))
                .map((thread) => ({ thread, legacy: describeLegacyThread(thread) }))
                .filter(({ legacy }) => threadMatchesCard(legacy, card));

            const matches = [];
            for (const { thread, legacy } of matching) {
                if (!(await isThreadMigrated(legacy.url))) {
                    matches.push({ ...legacy, likes: (await fetchThreadLikes(thread)).length });
                }
            }
            res.status(StatusCodes.OK).json(matches);
        }
    )
);

// Create suggestion (always a draft)
router.post(
    "/",
    validateRequest(Permission.MAKE_SUGGESTIONS),
    forceDerived,
    forceTags,
    prepareCreateBody,
    celebrate({ [Segments.BODY]: Schemas.CardSuggestion.DraftSave }),
    asyncHandler<unknown, unknown, ICardSuggestion, unknown>(async (req, res) => {
        const suggestion = await dataService.suggestions.create(req.body);

        await logActivity(LogCategory.SUGGESTION, "suggestion.created", "<principal> created suggestion <suggestion>", {
            context: { suggestion: cardSnapshot(suggestion.id, suggestion.card) }
        });

        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Draft save - stays a draft. A suggestion already submitted can never be saved back to draft
// through this route; use PUT /:id instead, which is the only way to edit one further.
router.put(
    "/:id/draft",
    validateRequest(
        (principal) =>
            hasPermission(principal, Permission.EDIT_SUGGESTIONS) ||
            hasPermission(principal, Permission.MAKE_SUGGESTIONS)
    ),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    loadSuggestionForOwnershipCheck,
    validateRequest(requiresEditOrOwnership),
    rejectArchived,
    (_req: Request, res: Response, next: NextFunction) => {
        const existing = res.locals.suggestion as ICardSuggestion;
        if (!existing.draft) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Validation Error",
                "This suggestion has already been submitted and can no longer be saved as a draft"
            );
        }
        next();
    },
    forceDerived,
    forceTags,
    prepareDraftSaveBody,
    celebrate({ [Segments.BODY]: Schemas.CardSuggestion.DraftSave }),
    asyncHandler<{ id: string }, unknown, ICardSuggestion, unknown>(async (req, res) => {
        const { id } = req.params;
        let suggestion = req.body;
        suggestion.id = id;
        suggestion = await dataService.suggestions.update(suggestion);

        await logActivity(LogCategory.SUGGESTION, "suggestion.updated", "<principal> updated suggestion <suggestion>", {
            context: { suggestion: cardSnapshot(id, suggestion.card) }
        });

        res.status(StatusCodes.OK).json(suggestion);
    })
);

// The only route that edits an already-submitted suggestion further, and also how a still-draft one
// is completed for the first time (no separate "submit" step) - always results in draft:false.
router.put(
    "/:id",
    validateRequest(
        (principal) =>
            hasPermission(principal, Permission.EDIT_SUGGESTIONS) ||
            hasPermission(principal, Permission.MAKE_SUGGESTIONS)
    ),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        // Completing a legacy suggestion may carry over one of its designer's old forum threads - see thread-matches
        [Segments.QUERY]: { legacyThread: Joi.string() }
    }),
    loadSuggestionForOwnershipCheck,
    validateRequest(requiresEditOrOwnership),
    rejectArchived,
    forceDerived,
    forceTags,
    prepareLiveSaveBody,
    celebrate({ [Segments.BODY]: Schemas.CardSuggestion.Full }),
    asyncHandler<{ id: string }, unknown, ICardSuggestion, { legacyThread?: string }>(async (req, res) => {
        const { id } = req.params;
        const existing = res.locals.suggestion as ICardSuggestion;
        // Completing a legacy suggestion is its real submission, just as a draft's is
        const wasDraft = existing.draft || !!existing.legacy;
        let suggestion = req.body;
        suggestion.id = id;

        await assertChecklistJustified(suggestion);

        const { legacyThread } = req.query;
        let threadCreated: Date | undefined;
        if (legacyThread) {
            if (!existing.legacy) {
                throw new ApiErrorResponse(
                    StatusCodes.BAD_REQUEST,
                    "Validation Error",
                    "Only a legacy suggestion can take over an old forum thread"
                );
            }
            // The thread must be its designer's, whoever is completing it on their behalf
            const { thread, legacy } = await loadLegacyThread(legacyThread, existing.createdBy);
            const likes = await fetchThreadLikes(thread);
            suggestion._metadata = {
                ...suggestion._metadata,
                discord: { ...suggestion._metadata?.discord, legacyUrl: legacy.url },
                engagement: {
                    reactions: mergeReactions(existing.createdBy, suggestion._metadata?.engagement?.reactions, likes)
                }
            };
            threadCreated = legacy.createdAt;
        }

        // Synced only once the thread's date is in place, so nothing is posted under the wrong one
        suggestion = await dataService.suggestions.update(suggestion, true, !threadCreated);
        if (threadCreated) {
            suggestion = (await dataService.suggestions.setCreated(id, threadCreated)) ?? suggestion;
            suggestion = await dataService.suggestions.sync(suggestion);
        }

        await logActivity(
            LogCategory.SUGGESTION,
            wasDraft ? "suggestion.submitted" : "suggestion.updated",
            `<principal> ${wasDraft ? "submitted" : "updated"} suggestion <suggestion>`,
            {
                context: { suggestion: cardSnapshot(id, suggestion.card) }
            }
        );

        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Loads the target suggestion and enforces both rules together (see common/models/cards.ts) - a
// draft's non-owner 404s here rather than confirming someone else's draft exists at all.
const loadReactableSuggestion = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { principal } = getContext();
    const discordId = requireDiscordId(principal);
    const { id } = req.params;
    const [suggestion] = await dataService.suggestions.read({ id });
    if (!suggestion || !canViewSuggestion(suggestion, discordId)) {
        notFoundSuggestion(id);
    }
    const blockReason = suggestionReactionBlockReason(suggestion, discordId);
    if (blockReason) {
        throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Validation Error", blockReason);
    }
    res.locals.suggestion = suggestion;
    next();
});

// React - anyone who can see a suggestion, other than the person who made it, can set their own
// Like/Dislike/Ignore on it - see loadReactableSuggestion.
router.post(
    "/:id/reaction",
    validateRequest(Permission.READ_SUGGESTIONS),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        [Segments.BODY]: {
            reactType: Joi.string()
                .valid(...reactionTypes)
                .required()
        }
    }),
    loadReactableSuggestion,
    asyncHandler<{ id: string }, unknown, { reactType: (typeof reactionTypes)[number] }, unknown>(async (req, res) => {
        const { principal } = getContext();
        const discordId = requireDiscordId(principal);
        const { id } = req.params;
        const { reactType } = req.body;
        const suggestion = await dataService.suggestions.react(id, discordId, reactType);
        if (!suggestion) {
            notFoundSuggestion(id);
        }
        res.status(StatusCodes.OK).json(suggestion);
    })
);

router.delete(
    "/:id/reaction",
    validateRequest(Permission.READ_SUGGESTIONS),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    loadReactableSuggestion,
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { principal } = getContext();
        const discordId = requireDiscordId(principal);
        const { id } = req.params;
        const suggestion = await dataService.suggestions.unreact(id, discordId);
        if (!suggestion) {
            notFoundSuggestion(id);
        }
        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Approve - unlike voting, gated on the dedicated APPROVE_SUGGESTIONS permission
router.post(
    "/:id/approve",
    validateRequest(Permission.APPROVE_SUGGESTIONS),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { principal } = getContext();
        const discordId = requireDiscordId(principal);
        const { id } = req.params;
        const [existing] = await dataService.suggestions.read({ id });
        if (!existing) {
            notFoundSuggestion(id);
        }
        const blockReason = suggestionApprovalBlockReason(existing);
        if (blockReason) {
            throw new ApiErrorResponse(StatusCodes.BAD_REQUEST, "Validation Error", blockReason);
        }
        const suggestion = await dataService.suggestions.setApproval(id, discordId);
        if (!suggestion) {
            notFoundSuggestion(id);
        }

        await logActivity(
            LogCategory.SUGGESTION,
            "suggestion.approved",
            "<principal> approved suggestion <suggestion>",
            {
                context: { suggestion: cardSnapshot(id, suggestion.card) }
            }
        );

        res.status(StatusCodes.OK).json(suggestion);
    })
);

router.delete(
    "/:id/approve",
    validateRequest(Permission.APPROVE_SUGGESTIONS),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;
        const suggestion = await dataService.suggestions.setApproval(id, undefined);
        if (!suggestion) {
            notFoundSuggestion(id);
        }

        await logActivity(
            LogCategory.SUGGESTION,
            "suggestion.unapproved",
            "<principal> unapproved suggestion <suggestion>",
            { context: { suggestion: cardSnapshot(id, suggestion.card) } }
        );

        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Manual re-sync trigger, for when an automatic sync failed or a forced refresh is wanted. Mirrors
// cards.ts's own `/sync/:type` route shape, minus `:type` since suggestions only sync to Discord.
router.post(
    "/:id/sync/discord",
    validateRequest(Permission.SYNC_SUGGESTIONS_DISCORD),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        [Segments.QUERY]: { forced: Joi.boolean() }
    }),
    asyncHandler<{ id: string }, unknown, unknown, { forced?: boolean }>(async (req, res) => {
        const { id } = req.params;
        const { forced } = req.query;
        let [suggestion] = await dataService.suggestions.read({ id });
        if (!suggestion) {
            notFoundSuggestion(id);
        }
        if (suggestion.draft) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Validation Error",
                "This suggestion is still a draft and has nothing to sync"
            );
        }
        if (suggestion.legacy) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Validation Error",
                "Legacy suggestions cannot be synced with Discord until they are completed"
            );
        }

        [suggestion] = await syncSuggestionForum([suggestion], forced);

        res.status(StatusCodes.OK).json(suggestion);
    })
);

// The project cards a legacy suggestion may already have been developed as - or, once linked to a draft project's
// card, that card, which archives it when the project begins
router.get(
    "/:id/card-matches",
    validateRequest(Permission.MANAGE_SUGGESTIONS_ARCHIVE),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;
        const [suggestion] = await dataService.suggestions.read({ id });
        if (!suggestion) {
            notFoundSuggestion(id);
        }
        if (!suggestion.legacy || suggestion.archived) {
            res.status(StatusCodes.OK).json({ matches: [] });
            return;
        }
        const [linkedCard] = await dataService.cards.read({ suggestionId: id });
        const linkedProject = linkedCard && (await dataService.projects.read({ number: linkedCard.project }))[0];
        res.status(StatusCodes.OK).json({
            matches: linkedCard ? [] : await getSuggestionCardMatches(suggestion),
            linkedTo:
                linkedCard && linkedProject
                    ? { project: { number: linkedProject.number, code: linkedProject.code }, number: linkedCard.number }
                    : undefined
        });
    })
);

// Settles a legacy suggestion as having become a project card: archived as used in it, or - while the project is
// still in draft - named by the card, so initialising the project archives it the same way any suggestion used is
router.post(
    "/:id/developed-as",
    validateRequest(Permission.MANAGE_SUGGESTIONS_ARCHIVE),
    celebrate({
        [Segments.PARAMS]: { id: Joi.string().required() },
        [Segments.BODY]: { project: Joi.number().required(), number: Joi.number().required(), version: Joi.string() }
    }),
    asyncHandler<{ id: string }, unknown, { project: number; number: number; version?: SemanticVersion }, unknown>(
        async (req, res) => {
            const { id } = req.params;
            const [suggestion] = await dataService.suggestions.read({ id });
            if (!suggestion) {
                notFoundSuggestion(id);
            }
            // Only a card still on offer - a card comes from one suggestion at most, and this re-checks that at the
            // moment it is claimed rather than trusting what the page was shown
            const matches = suggestion.legacy && !suggestion.archived ? await getSuggestionCardMatches(suggestion) : [];
            const match = matches.find(
                (entry) =>
                    entry.project.number === req.body.project &&
                    entry.number === req.body.number &&
                    entry.version === req.body.version
            );
            if (!match) {
                throw new ApiErrorResponse(
                    StatusCodes.BAD_REQUEST,
                    "Validation Error",
                    "That card isn't one this suggestion can be archived as - it may have been claimed already"
                );
            }

            let updated = suggestion;
            if (match.project.isDraft) {
                await dataService.cards.setSuggestionId(match.project.number, match.number, id, match.version);
            } else {
                const { principal } = getContext();
                suggestion.archived = {
                    reason: "usedInProject",
                    project: { code: match.project.code, number: match.number },
                    archivedAt: new Date(),
                    archivedBy: principal.id
                };
                updated = await dataService.suggestions.update(suggestion);
            }
            invalidateSuggestionCardMatches();

            await logActivity(
                LogCategory.SUGGESTION,
                "suggestion.developedAs",
                `<principal> marked suggestion <suggestion> as developed into ${cardMatchLabel(match)}`,
                { context: { suggestion: cardSnapshot(id, updated.card) } }
            );

            res.status(StatusCodes.OK).json(updated);
        }
    )
);

// Delete suggestion
router.delete(
    "/:id",
    validateRequest(
        (principal) =>
            hasPermission(principal, Permission.DELETE_SUGGESTIONS) ||
            hasPermission(principal, Permission.MAKE_SUGGESTIONS)
    ),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    loadSuggestionForOwnershipCheck,
    validateRequest((principal, req, res) => {
        const suggestion = res.locals.suggestion as ICardSuggestion;
        return (
            hasPermission(principal, Permission.DELETE_SUGGESTIONS) ||
            validate(
                principal,
                Permission.MAKE_SUGGESTIONS,
                (principal) => "discordId" in principal && principal.discordId === suggestion.createdBy
            )
        );
    }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;
        const [deleted] = await dataService.suggestions.destroy({ id });
        // Whatever pool had set it aside has nothing left to hold
        await dataService.pools.destroy({ suggestion: id });

        await logActivity(LogCategory.SUGGESTION, "suggestion.deleted", "<principal> deleted suggestion <suggestion>", {
            context: { suggestion: cardSnapshot(id, deleted.card) },
            severity: "warn"
        });

        res.status(StatusCodes.OK).json(deleted);
    })
);

export default router;
