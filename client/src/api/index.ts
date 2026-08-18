import {
    BaseQueryFn,
    createApi,
    FetchArgs,
    fetchBaseQuery,
    FetchBaseQueryError,
    FetchBaseQueryMeta
} from "@reduxjs/toolkit/query/react";
import {
    IPlaytestingUpdate,
    IProject,
    IProjectProgress,
    IProjectRelease,
    IReleaseProgress
} from "common/models/projects";
import { ReleaseDate, UUID } from "common/models/shared";
import { buildUrl, SemanticVersion } from "common/utils";
import { StatusCodes } from "http-status-codes";
import type { BatchRenderJob, IGetRequest, IGetResponse, SingleRenderJob } from "server/types";
import { Faction, ICardSuggestion, IPlaytestCard, IRenderCard } from "common/models/cards";
import { DesignStatus, IReleaseCheckSummary, ISlot, ReleaseCheckCategory, SlotStatuses } from "common/models/slots";
import { ICardProgress } from "common/progress/calc";
import { IPlaytestReview } from "common/models/reviews";
import { IDeck } from "common/models/decks";
import { DeckLink, DecklistLink, DeepPartial, SingleOrArray } from "common/types";
import { MeResponse, Role, RoleWithUserCount, SafeIntegration, User } from "common/models/auth";
import { ILogEntry } from "common/models/logs";
import { GlobalStats, ProjectStats } from "common/models/stats";
import { getConnectionId } from "./connectionId";
import { ApiTag, generateFor, tagTypes } from "./tagManager";
import { toNormalizedError } from "./errors";
import { refreshSession } from "./refresh";

const baseQuery = fetchBaseQuery({
    baseUrl: "/api/v1",
    credentials: "include",
    prepareHeaders: (headers) => {
        const connectionId = getConnectionId();
        if (connectionId) headers.set("X-Client-Id", connectionId);
        return headers;
    }
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
    args,
    queryApi,
    extraOptions
) => {
    let result = await baseQuery(args, queryApi, extraOptions);

    if (result.meta?.response?.status === StatusCodes.UNAUTHORIZED) {
        const outcome = await refreshSession();

        if (outcome === "refreshed" || outcome === "concurrent") {
            result = await baseQuery(args, queryApi, extraOptions);
        } else if (outcome === "expired" && queryApi.endpoint !== "getMe") {
            queryApi.dispatch(api.util.invalidateTags([{ type: "me" }]));
        }
    }

    if (result.error) {
        result = {
            ...result,
            error: { ...result.error, data: toNormalizedError(result.error) } as FetchBaseQueryError
        };
    }

    return result;
};

const api = createApi({
    reducerPath: "api",
    baseQuery: baseQueryWithReauth,
    tagTypes,
    endpoints: (builder) => ({
        // Login API
        login: builder.mutation<void, void>({
            query: () => ({
                url: "login",
                method: "POST"
            })
        }),
        logout: builder.mutation<void, void>({
            query: () => ({
                url: "logout",
                method: "POST",
                credentials: "include",
                responseHandler: (response) => response.text()
            }),
            invalidatesTags: [{ type: "me" }]
        }),
        // Users API
        getMe: builder.query<MeResponse | undefined, void>({
            query: () => {
                const url = buildUrl("users/me");
                return {
                    url,
                    method: "GET",
                    // 401 (eg. no authentication provided) is treated as an undefined user rather than an error
                    validateStatus: (response) => [StatusCodes.OK, StatusCodes.UNAUTHORIZED].includes(response.status)
                };
            },
            transformResponse: (response: MeResponse, meta: FetchBaseQueryMeta) =>
                meta?.response?.status === StatusCodes.UNAUTHORIZED ? undefined : response,
            providesTags: (result) => [
                ...generateFor(result, "me", { includeList: false }),
                ...generateFor(result?.roles, "role", { includeList: false })
            ]
        }),
        impersonateRole: builder.mutation<MeResponse, { roleId: string }>({
            query: ({ roleId }) => {
                const url = buildUrl(`impersonation/role/${roleId}`);
                return { url, method: "POST" };
            },
            invalidatesTags: [{ type: "me" }]
        }),
        impersonateUser: builder.mutation<MeResponse, { discordId: string }>({
            query: ({ discordId }) => {
                const url = buildUrl(`impersonation/user/${discordId}`);
                return { url, method: "POST" };
            },
            invalidatesTags: [{ type: "me" }]
        }),
        stopImpersonating: builder.mutation<MeResponse, void>({
            query: () => {
                const url = buildUrl("impersonation/stop");
                return { url, method: "POST" };
            },
            invalidatesTags: [{ type: "me" }]
        }),
        getUsers: builder.query<IGetResponse<User>, IGetRequest<User> | void>({
            query: (options) => {
                const url = buildUrl("users", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results?.items, "user")
        }),
        getUser: builder.query<User, { discordId: string }>({
            query: (options) => {
                const { discordId } = options;
                const url = buildUrl(`users/${discordId}`);
                return { url, method: "GET" };
            },
            providesTags: (result, _error, args) => generateFor(result, "user", { includeList: false, args })
        }),
        // Stats API
        getGlobalStats: builder.query<GlobalStats, void>({
            query: () => {
                const url = buildUrl("stats");
                return { url, method: "GET" };
            },
            providesTags: () => [
                { type: "card", id: "LIST" },
                { type: "review", id: "LIST" },
                { type: "user", id: "LIST" },
                { type: "project", id: "LIST" }
            ]
        }),
        getProjectStats: builder.query<ProjectStats, { project: number }>({
            query: ({ project }) => {
                const url = buildUrl(`projects/${project}/stats`);
                return { url, method: "GET" };
            },
            providesTags: (_result, _error, { project }) => [
                { type: "card", id: `LIST|${project}` },
                { type: "review", id: "LIST" },
                { type: "deck", id: "LIST" }
            ]
        }),
        getProjectProgress: builder.query<IProjectProgress, { project: number }>({
            query: ({ project }) => {
                const url = buildUrl(`projects/${project}/progress`);
                return { url, method: "GET" };
            },
            providesTags: (_result, _error, { project }) => [
                { type: "project", id: project },
                { type: "slot", id: `LIST|${project}` }
            ]
        }),
        updateUser: builder.mutation<User, User>({
            query: (user) => {
                const url = buildUrl(`users/${user.discordId}`);
                return { url, method: "PUT", body: user };
            },
            invalidatesTags: (result) => [
                ...generateFor(result, "me", { includeList: false }),
                ...generateFor(result, "user")
            ]
        }),
        // Roles API
        getRoles: builder.query<IGetResponse<RoleWithUserCount>, IGetRequest<Role> | void>({
            query: (options) => {
                const url = buildUrl("roles", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results?.items, "role")
        }),
        updateRole: builder.mutation<Role, Role>({
            query: (role) => {
                const url = buildUrl(`roles/${role.discordId}`);
                return { url, method: "PUT", body: role };
            },
            invalidatesTags: (result) => generateFor(result, "role")
        }),
        assignPlaytestingRole: builder.mutation<User, void>({
            query: () => ({
                url: buildUrl("roles/me/playtesting-team"),
                method: "POST"
            }),
            invalidatesTags: (result) => generateFor(result, "me", { includeList: false })
        }),
        // Integrations API
        getIntegrations: builder.query<IGetResponse<SafeIntegration>, IGetRequest<SafeIntegration> | void>({
            query: (options) => {
                const url = buildUrl("integrations", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results?.items, "integration")
        }),
        createIntegration: builder.mutation<
            { token: string; integration: SafeIntegration },
            Pick<SafeIntegration, "name" | "enabled" | "permissions" | "ownerIds">
        >({
            query: (integration) => {
                const url = buildUrl("integrations");
                const body = integration;
                return { url, method: "POST", body };
            },
            invalidatesTags: (result) => generateFor(result?.integration, "integration")
        }),
        updateIntegration: builder.mutation<
            SafeIntegration,
            Pick<SafeIntegration, "id" | "name" | "enabled" | "permissions" | "ownerIds">
        >({
            query: (integration) => {
                const { id, ...body } = integration;
                const url = buildUrl(`integrations/${id}`);
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => generateFor(result, "integration")
        }),
        deleteIntegration: builder.mutation<SafeIntegration, { id: string }>({
            query: (options) => {
                const url = buildUrl(`integrations/${options.id}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => generateFor(result, "integration")
        }),
        recycleIntegrationToken: builder.mutation<{ token: string; integration: SafeIntegration }, { id: string }>({
            query: (options) => {
                const url = buildUrl(`integrations/${options.id}/token`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => generateFor(result?.integration, "integration")
        }),
        // Cards API
        getCards: builder.query<IGetResponse<IPlaytestCard>, IGetRequest<IPlaytestCard> | void>({
            query: (options) => {
                const url = buildUrl("cards", options);
                return { url, method: "GET" };
            },
            providesTags: (response, _error, args) => generateFor(response?.items, "card", { args })
        }),
        getCard: builder.query<IPlaytestCard, { project: number; number: number; version: SemanticVersion | "latest" }>(
            {
                query: (options) => {
                    const url = buildUrl(`cards/${options.project}/${options.number}/${options.version}`);
                    return { url, method: "GET" };
                },
                providesTags: (response, _error, args) => generateFor(response, "card", { includeList: false, args })
            }
        ),
        getPreviousCard: builder.query<IPlaytestCard, { project: number; number: number; version: SemanticVersion }>({
            query: (options) => {
                const url = buildUrl(`cards/${options.project}/${options.number}/${options.version}/previous`);
                return { url, method: "GET" };
            },
            providesTags: (response, _error, args) => generateFor(response, "card", { includeList: false, args })
        }),
        putDraftCard: builder.mutation<IPlaytestCard, IPlaytestCard>({
            query: (card) => {
                const url = buildUrl(`cards/${card.project}/${card.number}/draft`);
                const body = card;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => generateFor(result, "card")
        }),
        deleteDraft: builder.mutation<IPlaytestCard, IPlaytestCard>({
            query: (card) => {
                const url = buildUrl(`cards/${card.project}/${card.number}/draft/${card.version}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => generateFor(result, "card")
        }),
        moveCard: builder.mutation<
            IPlaytestCard,
            { project: number; number: number; version: SemanticVersion; to: number }
        >({
            query: ({ project, number, version, to }) => {
                const url = buildUrl(`cards/${project}/${number}/${version}/move`);
                return { url, method: "POST", body: { to } };
            },
            invalidatesTags: (result) => generateFor(result, "card")
        }),
        // Suggestions API
        getSuggestions: builder.query<IGetResponse<ICardSuggestion>, IGetRequest<ICardSuggestion> | void>({
            query: (options) => {
                const url = buildUrl("suggestions", options);
                return { url, method: "GET" };
            },
            providesTags: (response) => generateFor(response?.items, "suggestion")
        }),
        getSuggestionsBy: builder.query<IGetResponse<ICardSuggestion>, { discordId: string }>({
            query: (options) => {
                const url = buildUrl(`suggestions/${options.discordId}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => generateFor(result?.items, "suggestion")
        }),
        createSuggestion: builder.mutation<ICardSuggestion, Omit<ICardSuggestion, "created" | "updated">>({
            query: (suggestion) => {
                const url = buildUrl("suggestions");
                const body = suggestion;
                return { url, method: "POST", body };
            },
            invalidatesTags: (result) => [...generateFor(result, "suggestion"), ...generateFor(result?.tags, "tag")]
        }),
        updateSuggestion: builder.mutation<ICardSuggestion, ICardSuggestion>({
            query: (suggestion) => {
                const url = buildUrl(`suggestions/${suggestion.id}`);
                const body = suggestion;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => [...generateFor(result, "suggestion"), ...generateFor(result?.tags, "tag")]
        }),
        deleteSuggestion: builder.mutation<ICardSuggestion, { id: string }>({
            query: (options) => {
                const url = buildUrl(`suggestions/${options.id}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => [...generateFor(result, "suggestion"), ...generateFor(result?.tags, "tag")]
        }),
        getTags: builder.query<string[], void>({
            query: () => {
                const url = buildUrl("suggestions/tags");
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results, "tag")
        }),
        // Render API
        renderImage: builder.mutation<Blob, IRenderCard>({
            queryFn: async (card, _api, _extraOptions, baseQuery) => {
                const result = await baseQuery({
                    url: buildUrl("render", { format: "PNG", rounded: true }),
                    body: card,
                    method: "POST",
                    responseHandler: (response) => response.blob()
                });
                return result.error ? { error: result.error } : { data: result.data as Blob };
            }
        }),
        renderPrintSheet: builder.mutation<Blob, IRenderCard | IRenderCard[]>({
            queryFn: async (cards, _api, _extraOptions, baseQuery) => {
                const result = await baseQuery({
                    url: buildUrl("render", { format: "PDF", rounded: true }),
                    body: cards,
                    method: "POST",
                    responseHandler: (response) => response.blob()
                });
                return result.error ? { error: result.error } : { data: result.data as Blob };
            }
        }),
        getRenderJob: builder.query<SingleRenderJob | BatchRenderJob, { id: UUID }>({
            query: (options) => {
                const url = buildUrl("render/job", options);
                return { url, method: "GET" };
            }
        }),
        // Projects API
        getProjects: builder.query<IGetResponse<IProject>, IGetRequest<IProject> | void>({
            query: (options) => {
                const url = buildUrl("projects", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results?.items, "project")
        }),
        getProject: builder.query<IProject, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}`);
                return { url, method: "GET" };
            },
            providesTags: (result, _error, args) => generateFor(result, "project", { includeList: false, args })
        }),
        createProject: builder.mutation<IProject, Omit<IProject, "created" | "updated">>({
            query: (project) => {
                const url = buildUrl("projects");
                const body = project;
                return { url, method: "POST", body };
            },
            invalidatesTags: (result) => generateFor(result, "project")
        }),
        initialiseProject: builder.mutation<{ project: IProject; cards: IPlaytestCard[] }, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}/initialise`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => [
                ...generateFor(result?.project, "project"),
                ...generateFor(result?.cards, "card"),
                ...generateFor(undefined, "slot", { includeList: true })
            ]
        }),
        updateProject: builder.mutation<IProject, IProject>({
            query: (project) => {
                const url = buildUrl(`projects/${project.number}`);
                const body = project;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => generateFor(result, "project")
        }),
        deleteProject: builder.mutation<IProject, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => generateFor(result, "project")
        }),
        archiveProject: builder.mutation<IProject, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}/archive`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => generateFor(result, "project")
        }),
        // Slots API
        getSlot: builder.query<ISlot, { project: number; number: number }>({
            query: ({ project, number }) => {
                const url = buildUrl(`projects/${project}/slots/${number}`);
                return { url, method: "GET" };
            },
            providesTags: (result, _error, args) => generateFor(result, "slot", { includeList: false, args })
        }),
        getSlots: builder.query<IGetResponse<ISlot>, { project: number } & IGetRequest<ISlot>>({
            query: ({ project, ...options }) => {
                const url = buildUrl(`projects/${project}/slots`, options);
                return { url, method: "GET" };
            },
            providesTags: (response, _error, args) => generateFor(response?.items, "slot", { args })
        }),
        createSlot: builder.mutation<ISlot, { project: number; faction: Faction }>({
            query: ({ project, faction }) => {
                const url = buildUrl(`projects/${project}/slots`);
                return { url, method: "POST", body: { faction } };
            },
            invalidatesTags: (result) => generateFor(result, "slot")
        }),
        deleteSlot: builder.mutation<ISlot, { project: number; number: number }>({
            query: ({ project, number }) => {
                const url = buildUrl(`projects/${project}/slots/${number}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => generateFor(result, "slot")
        }),
        updateSlot: builder.mutation<
            ISlot,
            { project: number; number: number; statuses?: DeepPartial<SlotStatuses> } & Partial<
                Pick<ISlot, "type" | "notes">
            >
        >({
            query: ({ project, number, ...body }) => {
                const url = buildUrl(`projects/${project}/slots/${number}`);
                return { url, method: "PATCH", body };
            },
            invalidatesTags: (result) => generateFor(result, "slot")
        }),
        assignSlotRelease: builder.mutation<
            { slot: ISlot; evictedSlot?: ISlot },
            { project: number; number: number; code: string | null; position?: number }
        >({
            query: ({ project, number, ...body }) => {
                const url = buildUrl(`projects/${project}/slots/${number}/release`);
                return { url, method: "PATCH", body };
            },
            invalidatesTags: (result) => [
                ...generateFor(result?.slot, "slot"),
                ...generateFor(result?.evictedSlot, "slot")
            ]
        }),
        getCardProgress: builder.query<ICardProgress, { project: number; number: number }>({
            query: ({ project, number }) => {
                const url = buildUrl(`projects/${project}/slots/${number}/progress`);
                return { url, method: "GET" };
            },
            providesTags: (_result, _error, { project, number }) => [{ type: "slot", id: `${project}|${number}` }]
        }),
        setSlotDesignStatus: builder.mutation<ISlot, { project: number; number: number; status: DesignStatus }>({
            query: ({ project, number, status }) => {
                const url = buildUrl(`projects/${project}/slots/${number}/design/status`);
                return { url, method: "PATCH", body: { status } };
            },
            invalidatesTags: (result) => generateFor(result, "slot")
        }),
        getReleaseCheckSummary: builder.query<IReleaseCheckSummary, { project: number; number: number }>({
            query: ({ project, number }) => {
                const url = buildUrl(`projects/${project}/slots/${number}/design/checks/summary`);
                return { url, method: "GET" };
            },
            providesTags: (_result, _error, { project, number }) => [
                { type: "slot", id: `${project}|${number}` },
                { type: "review", id: `LIST|${project}|${number}` }
            ]
        }),
        submitReleaseCheck: builder.mutation<
            ISlot,
            { project: number; number: number; ready: boolean; categories?: ReleaseCheckCategory[]; note?: string }
        >({
            query: ({ project, number, ...body }) => {
                const url = buildUrl(`projects/${project}/slots/${number}/design/checks`);
                return { url, method: "PATCH", body };
            },
            invalidatesTags: (result) => generateFor(result, "slot")
        }),
        // Releases API
        getReleasesProgress: builder.query<IReleaseProgress[], { project: number }>({
            query: ({ project }) => {
                const url = buildUrl(`projects/${project}/releases/progress`);
                return { url, method: "GET" };
            },
            providesTags: (_result, _error, { project }) => [
                { type: "project", id: project },
                { type: "slot", id: `LIST|${project}` }
            ]
        }),
        createRelease: builder.mutation<
            IProject,
            { project: number } & Omit<
                IProjectRelease,
                "created" | "updated" | "createdBy" | "updatedBy" | "releasedDate" | "number" | "capacity"
            >
        >({
            query: ({ project, ...body }) => {
                const url = buildUrl(`projects/${project}/releases`);
                return { url, method: "POST", body };
            },
            invalidatesTags: (result) => generateFor(result, "project")
        }),
        updateRelease: builder.mutation<
            { project: IProject; evictedSlots: ISlot[] },
            { project: number; originalCode: string } & Omit<
                IProjectRelease,
                "created" | "updated" | "createdBy" | "updatedBy" | "releasedDate" | "number" | "capacity"
            >
        >({
            query: ({ project, originalCode, ...body }) => {
                const url = buildUrl(`projects/${project}/releases/${originalCode}`);
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => [
                ...generateFor(result?.project, "project"),
                ...generateFor(result?.evictedSlots, "slot")
            ]
        }),
        reorderReleases: builder.mutation<IProject, { project: number; codes: string[] }>({
            query: ({ project, codes }) => {
                const url = buildUrl(`projects/${project}/releases/reorder`);
                return { url, method: "PATCH", body: { codes } };
            },
            invalidatesTags: (result) => generateFor(result, "project")
        }),
        publishRelease: builder.mutation<IProject, { project: number; code: string; releasedDate: ReleaseDate }>({
            query: ({ project, code, ...body }) => {
                const url = buildUrl(`projects/${project}/releases/${code}/publish`);
                return { url, method: "POST", body };
            },
            invalidatesTags: (result) => [
                ...generateFor(result, "project"),
                { type: "slot" as const, id: "LIST" },
                { type: "card" as const, id: "LIST" }
            ]
        }),
        deleteRelease: builder.mutation<
            { project: IProject; evictedSlots: ISlot[] },
            { project: number; code: string }
        >({
            query: ({ project, code }) => {
                const url = buildUrl(`projects/${project}/releases/${code}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => [
                ...generateFor(result?.project, "project"),
                ...generateFor(result?.evictedSlots, "slot")
            ]
        }),
        // Playtesting Update API
        getPlaytestingUpdates: builder.query<IGetResponse<IPlaytestingUpdate>, IGetRequest<IPlaytestingUpdate> | void>({
            query: (options) => {
                const url = buildUrl("playtesting-updates", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results?.items, "playtestingUpdate")
        }),
        getPlaytestingUpdate: builder.query<IPlaytestingUpdate, { project: number; version: number }>({
            query: (options) => {
                const url = buildUrl(`playtesting-updates/${options.project}/${options.version}`);
                return { url, method: "GET" };
            },
            providesTags: (result, _error, args) =>
                generateFor(result, "playtestingUpdate", { includeList: false, args })
        }),
        createPlaytestingUpdate: builder.mutation<
            { playtestingUpdate: IPlaytestingUpdate; project: IProject; cards: IPlaytestCard[] },
            Omit<IPlaytestingUpdate, "version" | "pullRequest" | "createdBy" | "created" | "updated">
        >({
            query: (playtestingUpdate) => {
                const url = buildUrl(`playtesting-updates/${playtestingUpdate.project}`);
                const body = playtestingUpdate;
                return { url, method: "POST", body };
            },
            invalidatesTags: (result) => {
                const projectTags = generateFor(result?.playtestingUpdate?.project, "project", {
                    idFunc: (project) => project
                });
                const cardTags = result?.playtestingUpdate
                    ? Object.entries(result.playtestingUpdate.cardChanges).map(([number, version]) => ({
                          type: "card" as ApiTag,
                          id: `${result.playtestingUpdate.project}|${number}|${version}`
                      }))
                    : [];
                return [...generateFor(result?.playtestingUpdate, "playtestingUpdate"), ...projectTags, ...cardTags];
            }
        }),
        getPlaytestingUpdateCards: builder.query<IPlaytestCard[], { project: number; version: number }>({
            query: (options) => {
                const url = buildUrl(`playtesting-updates/${options.project}/${options.version}/cards`);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results, "card")
        }),
        playtestingUpdatePrintSheet: builder.mutation<Blob, { project: number; version: number }>({
            queryFn: async ({ project, version }, _api, _extraOptions, baseQuery) => {
                const result = await baseQuery({
                    url: `playtesting-updates/${project}/${version}/print-sheet`,
                    method: "GET",
                    responseHandler: (response) => response.blob()
                });
                return result.error ? { error: result.error } : { data: result.data as Blob };
            }
        }),
        getPlaytestingUpdateImplemented: builder.query<IPlaytestCard[], { project: number; version: number }>({
            query: (options) => {
                const url = buildUrl(`playtesting-updates/${options.project}/${options.version}/implemented`);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results, "card")
        }),
        // Syncing API
        syncProjectImages: builder.mutation<
            IPlaytestCard[],
            { project: number; number?: number; version?: SemanticVersion; latest?: boolean; forced?: boolean }
        >({
            query: ({ project, number, version, latest, forced }) => {
                const url = buildUrl(`projects/${project}/sync/image`, { number, version, latest, forced });
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => generateFor(result, "card")
        }),
        syncCardImage: builder.mutation<
            IPlaytestCard,
            { project: number; number: number; version: SemanticVersion; forced?: boolean }
        >({
            query: ({ project, number, version, forced }) => {
                const url = buildUrl(`cards/${project}/${number}/${version}/sync/image`, { forced });
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => generateFor(result, "card")
        }),
        syncCardDiscord: builder.mutation<
            IPlaytestCard,
            { project: number; number: number; version: SemanticVersion; forced?: boolean }
        >({
            query: ({ project, number, version, forced }) => {
                const url = buildUrl(`cards/${project}/${number}/${version}/sync/discord`, { forced });
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => generateFor(result, "card")
        }),
        syncCardGithub: builder.mutation<
            IPlaytestCard,
            { project: number; number: number; version: SemanticVersion; forced?: boolean }
        >({
            query: ({ project, number, version, forced }) => {
                const url = buildUrl(`cards/${project}/${number}/${version}/sync/github`, { forced });
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => generateFor(result, "card")
        }),
        syncPlaytestingUpdateGithub: builder.mutation<
            IPlaytestingUpdate,
            { project: number; version: number; type: "code" | "data"; forced?: boolean }
        >({
            query: ({ project, version, type, forced }) => {
                const url = buildUrl(`playtesting-updates/${project}/${version}/sync/github/${type}`, { forced });
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => {
                if (!result) {
                    return [];
                }
                const projectTags = generateFor(result.project, "project", { idFunc: (project) => project });
                const cardTags = Object.entries(result.cardChanges).map(([number, version]) => ({
                    type: "card" as ApiTag,
                    id: `${result.project}|${number}|${version}`
                }));

                return [
                    ...generateFor(result, "playtestingUpdate"),
                    ...projectTags,
                    ...cardTags,
                    { type: "card" as ApiTag, id: "LIST" }
                ];
            }
        }),
        syncReviewDiscord: builder.mutation<
            IPlaytestReview,
            { project: number; number: number; version: SemanticVersion; reviewer: string; forced?: boolean }
        >({
            query: ({ project, number, version, reviewer, forced }) => {
                const url = buildUrl(`reviews/${project}/${number}/${version}/${reviewer}/sync/discord`, { forced });
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => generateFor(result, "review")
        }),
        // Reviews API
        getReview: builder.query<
            IPlaytestReview,
            { project: number; number: number; version: SemanticVersion; reviewer: string }
        >({
            query: (options) => {
                const url = buildUrl(
                    `reviews/${options.project}/${options.number}/${options.version}/${options.reviewer}`
                );
                return { url, method: "GET" };
            },
            providesTags: (result, _error, args) => generateFor(result, "review", { args })
        }),
        getReviews: builder.query<IGetResponse<IPlaytestReview>, IGetRequest<IPlaytestReview>>({
            query: (options) => {
                const url = buildUrl("reviews", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results?.items, "review")
        }),
        createReview: builder.mutation<IPlaytestReview, Omit<IPlaytestReview, "created" | "updated">>({
            query: (review) => {
                const url = buildUrl("reviews");
                const body = review;
                return { url, method: "POST", body };
            },
            // Submitting a review can also create/update deck records server-side (syncReviewDecks)
            invalidatesTags: (result) => [...generateFor(result, "review"), { type: "deck", id: "LIST" }]
        }),
        updateReview: builder.mutation<IPlaytestReview, IPlaytestReview>({
            query: (review) => {
                const url = buildUrl(`reviews/${review.project}/${review.number}/${review.version}/${review.reviewer}`);
                const body = review;
                return { url, method: "PUT", body };
            },
            // Editing a review can also create/update deck records server-side (syncReviewDecks)
            invalidatesTags: (result) => [...generateFor(result, "review"), { type: "deck", id: "LIST" }]
        }),
        deleteReview: builder.mutation<
            IPlaytestReview,
            { project: number; number: number; version: SemanticVersion; reviewer: string }
        >({
            query: (options) => {
                const url = buildUrl(
                    `reviews/${options.project}/${options.number}/${options.version}/${options.reviewer}`
                );
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => generateFor(result, "review")
        }),
        // Decks API
        getDecks: builder.query<IGetResponse<IDeck>, { filter?: SingleOrArray<DeepPartial<IPlaytestCard>> } | void>({
            query: (options) => {
                const url = buildUrl("decks", options ?? undefined);
                return { url, method: "GET" };
            },
            providesTags: (result) => generateFor(result?.items, "deck")
        }),
        addDeck: builder.mutation<IDeck, { link: DeckLink | DecklistLink }>({
            query: (body) => {
                const url = buildUrl("decks");
                return { url, method: "POST", body };
            },
            invalidatesTags: (result) => generateFor(result, "deck")
        }),
        refreshDeck: builder.mutation<IDeck, { identifier: number | UUID }>({
            query: ({ identifier }) => {
                const url = buildUrl(`decks/${identifier}/refresh`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => generateFor(result, "deck")
        }),
        // Logs API
        getLogs: builder.query<IGetResponse<ILogEntry>, IGetRequest<ILogEntry>>({
            query: (options) => {
                const url = buildUrl("logs", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => generateFor(results?.items, "log")
        })
    })
});

export const {
    useLoginMutation,
    useLogoutMutation,

    useGetGlobalStatsQuery,
    useGetProjectStatsQuery,
    useGetProjectProgressQuery,

    useGetUsersQuery,
    useGetUserQuery,
    useUpdateUserMutation,
    useImpersonateRoleMutation,
    useImpersonateUserMutation,
    useStopImpersonatingMutation,

    useGetRolesQuery,
    useUpdateRoleMutation,
    useAssignPlaytestingRoleMutation,

    useGetIntegrationsQuery,
    useCreateIntegrationMutation,
    useUpdateIntegrationMutation,
    useDeleteIntegrationMutation,
    useRecycleIntegrationTokenMutation,

    useGetCardsQuery,
    useGetCardQuery,
    useGetPreviousCardQuery,
    useLazyGetCardsQuery,
    usePutDraftCardMutation,
    useDeleteDraftMutation,
    useMoveCardMutation,

    useGetSuggestionsQuery,
    useGetSuggestionsByQuery,
    useCreateSuggestionMutation,
    useUpdateSuggestionMutation,
    useDeleteSuggestionMutation,
    useGetTagsQuery,

    useRenderImageMutation,
    useRenderPrintSheetMutation,
    useGetRenderJobQuery,

    useGetProjectsQuery,
    useLazyGetProjectsQuery,
    useGetProjectQuery,
    useLazyGetProjectQuery,
    useCreateProjectMutation,
    useInitialiseProjectMutation,
    useUpdateProjectMutation,
    useDeleteProjectMutation,
    useArchiveProjectMutation,

    useGetSlotQuery,
    useGetSlotsQuery,
    useLazyGetSlotsQuery,
    useCreateSlotMutation,
    useDeleteSlotMutation,
    useUpdateSlotMutation,
    useAssignSlotReleaseMutation,
    useGetCardProgressQuery,
    useSetSlotDesignStatusMutation,
    useGetReleaseCheckSummaryQuery,
    useSubmitReleaseCheckMutation,

    useGetReleasesProgressQuery,
    useCreateReleaseMutation,
    useUpdateReleaseMutation,
    useReorderReleasesMutation,
    usePublishReleaseMutation,
    useDeleteReleaseMutation,

    useGetPlaytestingUpdatesQuery,
    useGetPlaytestingUpdateQuery,
    useCreatePlaytestingUpdateMutation,
    useGetPlaytestingUpdateCardsQuery,
    usePlaytestingUpdatePrintSheetMutation,
    useGetPlaytestingUpdateImplementedQuery,

    useSyncProjectImagesMutation,
    useSyncCardImageMutation,
    useSyncCardDiscordMutation,
    useSyncCardGithubMutation,
    useSyncPlaytestingUpdateGithubMutation,
    useSyncReviewDiscordMutation,

    useGetReviewQuery,
    useLazyGetReviewQuery,
    useGetReviewsQuery,
    useCreateReviewMutation,
    useUpdateReviewMutation,
    useDeleteReviewMutation,

    useGetDecksQuery,
    useAddDeckMutation,
    useRefreshDeckMutation,

    useGetLogsQuery
} = api;

export default api;
