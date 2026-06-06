import { BaseQueryFn, createApi, FetchArgs, fetchBaseQuery, FetchBaseQueryError, FetchBaseQueryMeta } from "@reduxjs/toolkit/query/react";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { asArray, buildUrl, SemanticVersion } from "common/utils";
import { clearUser } from "./authSlice";
import { StatusCodes } from "http-status-codes";
import { UUID } from "crypto";
import type { BatchRenderJob, IGetRequest, IGetResponse, RefreshAuthResponse, SingleRenderJob } from "server/types";
import { ICardSuggestion, IPlaytestCard, IRenderCard } from "common/models/cards";
import { IPlaytestReview } from "common/models/reviews";
import { Role, User } from "common/models/auth";
import { Mutex } from "async-mutex";

type TagEntity = {
    me: User,
    user: User,
    role: Role,
    card: IPlaytestCard,
    suggestion: ICardSuggestion,
    tag: string,
    project: IProject,
    playtestingUpdate: IPlaytestingUpdate,
    review: IPlaytestReview
}
type ApiTag = keyof TagEntity;
const tagTypes = ["me", "user", "role", "card", "suggestion", "tag", "project", "playtestingUpdate", "review"] as const satisfies readonly ApiTag[];

const defaultIdFuncs: { [K in ApiTag]: (result: TagEntity[K]) => string | number | undefined } = {
    me: (me) => me.discordId,
    user: (user) => user.discordId,
    role: (role) => role.discordId,
    card: (card) => `${card.project}|${card.number}|${card.version}`,
    suggestion: (suggestion) => suggestion.id,
    tag: (tag) => tag,
    project: (project) => project.number,
    playtestingUpdate: (playtestingUpdate) => `${playtestingUpdate.project}|${playtestingUpdate.version}`,
    review: (review) => `${review.project}|${review.number}|${review.version}|${review.reviewer}`
};

function mapTags<T>(
    results: T | T[] | undefined,
    tag: ApiTag,
    options?: { idFunc?: (result: T) => string | number | undefined; includeList?: boolean }
) {
    const resolve = (options?.idFunc ?? defaultIdFuncs[tag]) as (result: T) => string | number | undefined;
    return [
        ...(results ? asArray(results).map((result) => ({ type: tag, id: resolve(result) })) : []),
        ...((options?.includeList ?? true) ? [{ type: tag, id: "LIST" }] : [])
    ];
}

const baseQuery = fetchBaseQuery({
    baseUrl: "/api/v1",
    credentials: "include"
});

const mutex = new Mutex();
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
    args,
    api,
    extraOptions
) => {
    // Wait if a refresh is already in progress, but don't lock yet
    await mutex.waitForUnlock();

    let result = await baseQuery(args, api, extraOptions);

    if (result.meta?.response?.status === StatusCodes.UNAUTHORIZED) {
        if (!mutex.isLocked()) {
            // We're the first 401 — acquire the lock and do the refresh
            const release = await mutex.acquire();
            try {
                const baseAuthQuery = fetchBaseQuery({ baseUrl: "/auth", credentials: "include" }) as BaseQueryFn<
                    string | FetchArgs,
                    RefreshAuthResponse,
                    FetchBaseQueryError,
                    unknown,
                    FetchBaseQueryMeta
                >;
                const refreshResult = await baseAuthQuery("/refresh", api, extraOptions);

                if (refreshResult.data?.status === "success") {
                    result = await baseQuery(args, api, extraOptions);
                } else {
                    api.dispatch(clearUser());
                    if (refreshResult.meta?.response?.status === StatusCodes.FORBIDDEN) {
                        window.location.href = "/auth/discord";
                    }
                }
            } finally {
                release(); // Always release, even if refresh throws
            }
        } else {
            // Another request is already refreshing — wait for it to finish, then retry
            await mutex.waitForUnlock();
            result = await baseQuery(args, api, extraOptions);
        }
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
        getMe: builder.query<User | undefined, void>({
            query: () => {
                const url = buildUrl("users/me");
                return {
                    url,
                    method: "GET",
                    // 401 (eg. no authentication provided) is treated as an undefined user rather than an error
                    validateStatus: (response) => [StatusCodes.OK, StatusCodes.UNAUTHORIZED].includes(response.status) };
            },
            transformResponse: (response: User, meta: FetchBaseQueryMeta) => (meta?.response?.status === StatusCodes.UNAUTHORIZED ? undefined : response),
            providesTags: (result) => [
                ...mapTags(result, "me", { includeList: false }),
                ...mapTags(result?.roles, "role", { includeList: false })
            ]
        }),
        getUsers: builder.query<IGetResponse<User>, IGetRequest<User> | void>({
            query: (options) => {
                const url = buildUrl("users", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results?.items, "user")
        }),
        getUser: builder.query<User, { discordId: string }>({
            query: (options) => {
                const { discordId } = options;
                const url = buildUrl(`users/${discordId}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result, "user", { includeList: false })
        }),
        updateUser: builder.mutation<User, User>({
            query: (user) => {
                const url = buildUrl(`users/${user.discordId}`);
                return { url, method: "PUT", body: user };
            },
            invalidatesTags: (result) => [
                ...mapTags(result, "me", { includeList: false }),
                ...mapTags(result, "user")
            ]
        }),
        // Roles API
        getRoles: builder.query<IGetResponse<Role>, IGetRequest<Role> | void>({
            query: (options) => {
                const url = buildUrl("roles", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results?.items, "role")
        }),
        updateRole: builder.mutation<Role, Role>({
            query: (role) => {
                const url = buildUrl(`roles/${role.discordId}`);
                return { url, method: "PUT", body: role };
            },
            invalidatesTags: (result) => mapTags(result, "role")
        }),
        // Cards API
        getCards: builder.query<IGetResponse<IPlaytestCard>, IGetRequest<IPlaytestCard> | void>({
            query: (options) => {
                const url = buildUrl("cards", options);
                return { url, method: "GET" };
            },
            providesTags: (response) => mapTags(response?.items, "card")
        }),
        getCard: builder.query<IPlaytestCard, { project: number, number: number, version: SemanticVersion }>({
            query: (options) => {
                const url = buildUrl(`cards/${options.project}/${options.number}/${options.version}`);
                return { url, method: "GET" };
            },
            providesTags: (response) => mapTags(response, "card", { includeList: false })
        }),
        getPreviousCard: builder.query<IPlaytestCard, { project: number, number: number, version: SemanticVersion }>({
            query: (options) => {
                const url = buildUrl(`cards/${options.project}/${options.number}/${options.version}/previous`);
                return { url, method: "GET" };
            },
            providesTags: (response) => mapTags(response, "card", { includeList: false })
        }),
        putDraftCard: builder.mutation<IPlaytestCard, IPlaytestCard>({
            query: (card) => {
                const url = buildUrl(`cards/${card.project}/${card.number}/draft`);
                const body = card;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => mapTags(result, "card")
        }),
        deleteDraft: builder.mutation<IPlaytestCard, IPlaytestCard>({
            query: (card) => {
                const url = buildUrl(`cards/${card.project}/${card.number}/draft/${card.version}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => mapTags(result, "card")
        }),
        // Suggestions API
        getSuggestions: builder.query<IGetResponse<ICardSuggestion>, IGetRequest<ICardSuggestion> | void>({
            query: (options) => {
                const url = buildUrl("suggestions", options);
                return { url, method: "GET" };
            },
            providesTags: (response) => mapTags(response?.items, "suggestion")
        }),
        getSuggestionsBy: builder.query<IGetResponse<ICardSuggestion>, { discordId: string }>({
            query: (options) => {
                const url = buildUrl(`suggestions/${options.discordId}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result?.items, "suggestion")
        }),
        createSuggestion: builder.mutation<ICardSuggestion, Omit<ICardSuggestion, "created" | "updated">>({
            query: (suggestion) => {
                const url = buildUrl("suggestions");
                const body = suggestion;
                return { url, method: "POST", body };
            },
            invalidatesTags: [
                ...mapTags(undefined, "suggestion"),
                ...mapTags(undefined, "tag")
            ]
        }),
        updateSuggestion: builder.mutation<ICardSuggestion, ICardSuggestion>({
            query: (suggestion) => {
                const url = buildUrl(`suggestions/${suggestion.id}`);
                const body = suggestion;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => [
                ...mapTags(result, "suggestion"),
                ...mapTags(result?.tags, "tag")
            ]
        }),
        deleteSuggestion: builder.mutation<ICardSuggestion, { id: string }>({
            query: (options) => {
                const url = buildUrl(`suggestions/${options.id}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => [
                ...mapTags(result, "suggestion"),
                ...mapTags(result?.tags, "tag")
            ]
        }),
        getTags: builder.query<string[], void>({
            query: () => {
                const url = buildUrl("suggestions/tags");
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results, "tag")
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
                return result.error
                    ? { error: result.error }
                    : { data: result.data as Blob };
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
                return result.error
                    ? { error: result.error }
                    : { data: result.data as Blob };
            }
        }),
        getRenderJob: builder.query<SingleRenderJob|BatchRenderJob, { id: UUID }>({
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
            providesTags: (results) => mapTags(results?.items, "project")
        }),
        getProject: builder.query<IProject, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result, "project", { includeList: false })
        }),
        createProject: builder.mutation<IProject, Omit<IProject, "created" | "updated">>({
            query: (project) => {
                const url = buildUrl("projects");
                const body = project;
                return { url, method: "POST", body };
            },
            invalidatesTags: mapTags(undefined, "project")
        }),
        initialiseProject: builder.mutation<{ project: IProject, cards: IPlaytestCard[] }, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}/initialise`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => [
                ...mapTags(result?.project, "project"),
                ...mapTags(result?.cards, "card")
            ]
        }),
        updateProject: builder.mutation<IProject, IProject>({
            query: (project) => {
                const url = buildUrl(`projects/${project.number}`);
                const body = project;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => mapTags(result, "project")
        }),
        deleteProject: builder.mutation<IProject, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => mapTags(result, "project")
        }),
        // Playtesting Update API
        getPlaytestingUpdates: builder.query<IGetResponse<IPlaytestingUpdate>, IGetRequest<IPlaytestingUpdate> | void>({
            query: (options) => {
                const url = buildUrl("playtesting-updates", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results?.items, "playtestingUpdate")
        }),
        getPlaytestingUpdate: builder.query<IPlaytestingUpdate, { project: number, version: number }>({
            query: (options) => {
                const url = buildUrl(`playtesting-updates/${options.project}/${options.version}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result, "playtestingUpdate", { includeList: false })
        }),
        createPlaytestingUpdate: builder.mutation<{ playtestingUpdate: IPlaytestingUpdate, project: IProject, cards: IPlaytestCard[] }, Omit<IPlaytestingUpdate, "version" | "pullRequest" | "createdBy" | "created" | "updated">>({
            query: (playtestingUpdate) => {
                const url = buildUrl(`playtesting-updates/${playtestingUpdate.project}`);
                const body = playtestingUpdate;
                return { url, method: "POST", body };
            },
            invalidatesTags: (result) => {
                const projectTags = mapTags(result?.playtestingUpdate?.project, "project", { idFunc: (project) => project });
                const cardTags = result?.playtestingUpdate ? Object.entries(result.playtestingUpdate.cardChanges).map(([number, version]) => ({ type: "card" as ApiTag, id: `${result.playtestingUpdate.project}|${number}|${version}` })) : [];
                return [
                    ...mapTags(result?.playtestingUpdate, "playtestingUpdate"),
                    ...projectTags,
                    ...cardTags
                ];
            }
        }),
        getPlaytestingUpdateCards: builder.query<IPlaytestCard[], { project: number, version: number }>({
            query: (options) => {
                const url = buildUrl(`playtesting-updates/${options.project}/${options.version}/cards`);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results, "card")
        }),
        playtestingUpdatePrintSheet: builder.mutation<Blob, { project: number, version: number }>({
            queryFn: async ({ project, version }, _api, _extraOptions, baseQuery) => {
                const result = await baseQuery({
                    url: `playtesting-updates/${project}/${version}/print-sheet`,
                    method: "GET",
                    responseHandler: (response) => response.blob()
                });
                return result.error
                    ? { error: result.error }
                    : { data: result.data as Blob };
            }
        }),
        getPlaytestingUpdateImplemented: builder.query<IPlaytestCard[], { project: number, version: number }>({
            query: (options) => {
                const url = buildUrl(`playtesting-updates/${options.project}/${options.version}/implemented`);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results, "card")
        }),
        // Syncing API
        syncProjectImages: builder.mutation<IPlaytestCard[], { project: number, number?: number, version?: SemanticVersion, latest?: boolean }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.project}/sync/image`, { number: options.number, version: options.version, latest: options.latest });
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => mapTags(result, "card")
        }),
        syncCardImage: builder.mutation<IPlaytestCard, { project: number, number: number, version: SemanticVersion }>({
            query: (options) => {
                const url = buildUrl(`cards/${options.project}/${options.number}/${options.version}/sync/image`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => mapTags(result, "card")
        }),
        syncCardDiscord: builder.mutation<IPlaytestCard, { project: number, number: number, version: SemanticVersion }>({
            query: (options) => {
                const url = buildUrl(`cards/${options.project}/${options.number}/${options.version}/sync/discord`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => mapTags(result, "card")
        }),
        syncCardGithub: builder.mutation<IPlaytestCard, { project: number, number: number, version: SemanticVersion }>({
            query: (options) => {
                const url = buildUrl(`cards/${options.project}/${options.number}/${options.version}/sync/github`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => mapTags(result, "card")
        }),
        syncProjectsGithub: builder.mutation<IPlaytestingUpdate[], void>({
            query: () => {
                const url = buildUrl("projects/sync/github");
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => {
                if (!result) {
                    return [];
                }
                const tags: { type: ApiTag, id: string | number | undefined }[] = [];
                for (const playtestingUpdate of result) {
                    const projectTags = mapTags(playtestingUpdate.project, "project", { idFunc: (project) => project });
                    const cardTags = Object.entries(playtestingUpdate.cardChanges).map(([number, version]) => ({ type: "card" as ApiTag, id: `${playtestingUpdate.project}|${number}|${version}` }));
                    tags.push(...mapTags(playtestingUpdate, "playtestingUpdate"), ...projectTags, ...cardTags);
                }

                return tags;
            }
        }),
        // Reviews API
        getReview: builder.query<IPlaytestReview, { project: number, number: number, version: SemanticVersion, reviewer: string }>({
            query: (options) => {
                const url = buildUrl(`reviews/${options.project}/${options.number}/${options.version}/${options.reviewer}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result, "review")
        }),
        getReviews: builder.query<IGetResponse<IPlaytestReview>, IGetRequest<IPlaytestReview>>({
            query: (options) => {
                const url = buildUrl("reviews", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results?.items, "review")
        }),
        createReview: builder.mutation<IPlaytestReview, Omit<IPlaytestReview, "created" | "updated">>({
            query: (review) => {
                const url = buildUrl("reviews");
                const body = review;
                return { url, method: "POST", body };
            },
            invalidatesTags: [{ type: "review", id: "LIST" }]
        }),
        updateReview: builder.mutation<IPlaytestReview, IPlaytestReview>({
            query: (review) => {
                const url = buildUrl(`reviews/${review.project}/${review.number}/${review.version}/${review.reviewer}`);
                const body = review;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => mapTags(result, "review")
        }),
        deleteReview: builder.mutation<IPlaytestReview, { project: number, number: number, version: SemanticVersion, reviewer: string }>({
            query: (options) => {
                const url = buildUrl(`reviews/${options.project}/${options.number}/${options.version}/${options.reviewer}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => mapTags(result, "review")
        })
    })
});

export const {
    useLoginMutation,
    useLogoutMutation,

    useGetUsersQuery,
    useGetUserQuery,
    useUpdateUserMutation,

    useGetRolesQuery,
    useUpdateRoleMutation,

    useGetCardsQuery,
    useGetCardQuery,
    useGetPreviousCardQuery,
    useLazyGetCardsQuery,
    usePutDraftCardMutation,
    useDeleteDraftMutation,

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
    useSyncProjectsGithubMutation,

    useGetReviewQuery,
    useLazyGetReviewQuery,
    useGetReviewsQuery,
    useCreateReviewMutation,
    useUpdateReviewMutation,
    useDeleteReviewMutation
} = api;

export default api;