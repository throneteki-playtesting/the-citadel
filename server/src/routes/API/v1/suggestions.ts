import * as Schemas from "common/models/schemas";
import { celebrate, Joi, Segments } from "@/celebrate";
import Permission from "common/models/permissions";
import asyncHandler from "express-async-handler";
import express, { NextFunction, Request, Response } from "express";
import {
    canViewSuggestion,
    ICardSuggestion,
    ICardSuggestionFilterable,
    ISuggestionsListQuery,
    reactionTypes,
    suggestionReactionBlockReason
} from "common/models/cards";
import { dataService, thronesDbCardPoolService } from "@/services";
import { hasPermission, validate } from "common/utils";
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
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import { ApiFieldError } from "@/types";
import { syncSuggestionForum } from "@/discord/forums/suggestionForum";

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
    getRequestSchema<ICardSuggestionFilterable>(
        Schemas.CardSuggestion.Full.keys(SuggestionFilterExtensions),
        { created: "desc" }
    ) as Joi.ObjectSchema<IGetRequest<ICardSuggestionFilterable> & ISuggestionsListQuery>
).keys({
    // Handled by applyReactionVisibilityFilter below, not the generic `filter` param - see
    // ISuggestionsListQuery's comment for why these two can't go through the generic filter schema
    unseen: Joi.boolean(),
    myReactions: Joi.string()
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
            ...(unseen ? { user: { discordId: { $ne: discordId } } } : {})
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

        const filters = Array.isArray(req.query.filter) ? req.query.filter : [req.query.filter];
        if (filters.some((f) => f?.archived !== undefined)) {
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
                visible.push({ ...branch, draft: true, user: { discordId } });
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
                return { ...branch, draft: true, user: { discordId } };
            }
            return { ...branch, draft: false };
        });
        next();
    }
);

type SuggestionEngagement = NonNullable<NonNullable<ICardSuggestion["_metadata"]>["engagement"]>;
const EMPTY_ENGAGEMENT: SuggestionEngagement = { reactions: {} };

function countLikes(reactions?: SuggestionEngagement["reactions"]) {
    return Object.values(reactions ?? {}).filter((entry) => entry.type === "like").length;
}

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

// Create (POST /) always starts a fresh draft with no engagement yet - there's nothing to preserve
// or clear, since nothing has been submitted for anyone to react to or approve.
function prepareCreateBody(req: Request, _res: Response, next: NextFunction) {
    req.body.draft = true;
    req.body._metadata = { ...req.body._metadata, engagement: EMPTY_ENGAGEMENT };
    next();
}

// PUT /:id/draft stays a draft - nothing to clear (never reacted to/approved), so persisted
// engagement just carries over untouched, discarding whatever the client's body contained.
function prepareDraftSaveBody(req: Request, res: Response, next: NextFunction) {
    const existing = res.locals.suggestion as ICardSuggestion;
    req.body.draft = true;
    req.body.user = existing.user;
    req.body._metadata = { ...req.body._metadata, engagement: existing._metadata?.engagement ?? EMPTY_ENGAGEMENT };
    next();
}

// Always clears reactions/approval unconditionally - an edit invalidates them rather than letting
// them carry over. `user` is forced from the stored record too - not whoever's editing right now.
function prepareLiveSaveBody(req: Request, res: Response, next: NextFunction) {
    const existing = res.locals.suggestion as ICardSuggestion;
    req.body.draft = false;
    req.body.user = existing.user;
    req.body._metadata = { ...req.body._metadata, engagement: EMPTY_ENGAGEMENT };
    next();
}

// Recomputes checklistRules() server-side and requires justification for every rule failing - not
// declared in the Joi schema, since that depends on card/questions/derived/pivotPoints together.
async function checklistJustificationErrors(suggestion: ICardSuggestion): Promise<ApiFieldError[]> {
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

    return results
        .filter((result) => result.status === "warn" && !suggestion.checklistJustifications?.[result.rule]?.trim())
        .map((result) => ({
            path: `checklistJustifications.${result.rule}`,
            message: "Is required"
        }));
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
            (principal) => "discordId" in principal && principal.discordId === suggestion.user.discordId
        )
    );
}

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
    asyncHandler<unknown, unknown, unknown, IGetRequest<ICardSuggestionFilterable>>(async (req, res) => {
        const { filter, orderBy, page, perPage } = req.query;
        const response = await getSuggestions(filter, orderBy, page, perPage);
        res.status(StatusCodes.OK).json(response);
    })
);

// Feed - declared before /:id, or the param route would swallow it as a suggestion id

// 10 = the Recent Suggestions rail's widest breakpoint (5 columns) times its 2-row client-side cap.
const FEED_RAIL_SIZE = 10;
const FEED_WORKING_SET_SIZE = 200; // bounded slice of newest/most-recently-updated suggestions the stats/rail draw from

router.get(
    "/feed",
    validateRequest(Permission.READ_SUGGESTIONS),
    asyncHandler(async (_req, res) => {
        const { principal } = getContext();
        const discordId = "discordId" in principal ? principal.discordId : undefined;
        const canManageArchive = hasPermission(principal, Permission.MANAGE_SUGGESTIONS_ARCHIVE);

        const baseFilter = canManageArchive ? {} : { archived: { $exists: false } as const };
        const allActive = await dataService.suggestions.read(
            { ...baseFilter, draft: false },
            { updated: "desc" },
            1,
            FEED_WORKING_SET_SIZE
        );

        const myDrafts = discordId ? await dataService.suggestions.count({ draft: true, user: { discordId } }) : 0;

        // Ignore is "seen, nothing to say" - already-ignored suggestions don't resurface in the rail.
        // Stats below are unaffected: they're aggregate counts, not a personalised "look at this" list.
        const recentCandidates = discordId
            ? allActive.filter((s) => s._metadata?.engagement?.reactions?.[discordId]?.type !== "ignore")
            : allActive;

        res.status(StatusCodes.OK).json({
            recent: recentCandidates.slice(0, FEED_RAIL_SIZE), // allActive is already sorted `updated: desc`
            stats: {
                total: allActive.length,
                totalSubmitters: new Set(allActive.map((s) => s.user.discordId)).size,
                // Mirrors suggestionApprovalPanel.tsx's own `awaiting` filter exactly - an already-ignored
                // suggestion is excluded here too, or this stat and that panel's own list would disagree.
                awaitingApproval: allActive.filter(
                    (s) =>
                        !s._metadata?.engagement?.approvedBy &&
                        countLikes(s._metadata?.engagement?.reactions) >= SUGGESTION_APPROVAL_VOTE_THRESHOLD &&
                        s._metadata?.engagement?.reactions?.[discordId ?? ""]?.type !== "ignore"
                ).length,
                // Replaces the old timestamp-based "newSinceLastVisit" - purely "has the current user
                // reacted at all", and also excludes the viewer's own suggestions ("new to you" is moot).
                unreacted: discordId
                    ? allActive.filter(
                          (s) => s.user.discordId !== discordId && !s._metadata?.engagement?.reactions?.[discordId]
                      ).length
                    : allActive.length,
                mine: discordId ? allActive.filter((s) => s.user.discordId === discordId).length : 0,
                myDrafts
            }
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

// Create suggestion (always a draft)
router.post(
    "/",
    validateRequest(Permission.MAKE_SUGGESTIONS),
    forceDerived,
    forceTags,
    prepareCreateBody,
    celebrate({ [Segments.BODY]: Schemas.CardSuggestion.DraftSave }),
    asyncHandler<unknown, unknown, Omit<ICardSuggestion, "id" | "updated" | "created">, unknown>(async (req, res) => {
        const body = req.body;
        const created = new Date();
        let suggestion = { ...body, created, updated: created } as ICardSuggestion;
        suggestion = await dataService.suggestions.create(suggestion);

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
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    loadSuggestionForOwnershipCheck,
    validateRequest(requiresEditOrOwnership),
    forceDerived,
    forceTags,
    prepareLiveSaveBody,
    celebrate({ [Segments.BODY]: Schemas.CardSuggestion.Full }),
    asyncHandler<{ id: string }, unknown, ICardSuggestion, unknown>(async (req, res) => {
        const { id } = req.params;
        const wasDraft = (res.locals.suggestion as ICardSuggestion).draft;
        let suggestion = req.body;
        suggestion.id = id;

        const fields = await checklistJustificationErrors(suggestion);
        if (fields.length > 0) {
            throw new ApiErrorResponse(
                StatusCodes.BAD_REQUEST,
                "Validation Error",
                `checklistJustifications: ${fields.map((f) => f.message).join(", ")}`,
                undefined,
                fields
            );
        }

        suggestion = await dataService.suggestions.update(suggestion);

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

        [suggestion] = await syncSuggestionForum([suggestion], forced);

        res.status(StatusCodes.OK).json(suggestion);
    })
);

// Unarchive - clears `archived` entirely, eg. when a suggestion was archived by mistake or is worth revisiting
router.post(
    "/:id/unarchive",
    validateRequest(Permission.MANAGE_SUGGESTIONS_ARCHIVE),
    celebrate({ [Segments.PARAMS]: { id: Joi.string().required() } }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;
        const [suggestion] = await dataService.suggestions.read({ id });
        if (!suggestion) {
            notFoundSuggestion(id);
        }
        delete suggestion.archived;
        const updated = await dataService.suggestions.update(suggestion);

        await logActivity(
            LogCategory.SUGGESTION,
            "suggestion.unarchived",
            "<principal> unarchived suggestion <suggestion>",
            {
                context: { suggestion: cardSnapshot(id, updated.card) }
            }
        );

        res.status(StatusCodes.OK).json(updated);
    })
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
                (principal) => "discordId" in principal && principal.discordId === suggestion.user.discordId
            )
        );
    }),
    asyncHandler<{ id: string }, unknown, unknown, unknown>(async (req, res) => {
        const { id } = req.params;
        const [deleted] = await dataService.suggestions.destroy({ id });

        await logActivity(LogCategory.SUGGESTION, "suggestion.deleted", "<principal> deleted suggestion <suggestion>", {
            context: { suggestion: cardSnapshot(id, deleted.card) },
            severity: "warn"
        });

        res.status(StatusCodes.OK).json(deleted);
    })
);

export default router;
