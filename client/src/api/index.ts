import { BaseQueryFn, createApi, FetchArgs, fetchBaseQuery, FetchBaseQueryError, FetchBaseQueryMeta } from "@reduxjs/toolkit/query/react";
import { IPlaytestingUpdate, IProject } from "common/models/projects";
import { Role, User } from "common/models/user";
import { asArray, buildUrl, SemanticVersion } from "common/utils";
import { clearUser } from "./authSlice";
import { StatusCodes } from "http-status-codes";
import { UUID } from "crypto";
import type { BatchRenderJob, IGetRequest, IGetResponse, RefreshAuthResponse, SingleRenderJob } from "server/types";
import { ICardSuggestion, IPlaytestCard, IRenderCard } from "common/models/cards";
import { IPlaytestReview } from "common/models/reviews";

export const baseUrl = import.meta.env.VITE_SERVER_HOST || "";
const tagTypes = ["me", "user", "role", "card", "suggestion", "tag", "project", "playtestingUpdate", "review"] as const;
type ApiTag = typeof tagTypes[number];

const baseQuery = fetchBaseQuery({
    baseUrl: `${baseUrl}/api/v1`,
    credentials: "include"
});

function mapTags<T>(results: T | T[] | undefined, tag: ApiTag, idFunc: (result: T) => string | number | undefined, includeList: boolean = true) {
    return [
        ...(results ? asArray(results).map((result) => ({ type: tag, id: idFunc(result) })) : []),
        ...(includeList ? [{ type: tag, id: "LIST" }] : [])
    ];
}

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError>
    = async (args, api, extraOptions) =>
    {
        let result = await baseQuery(args, api, extraOptions);
        if (result.meta?.response?.status === StatusCodes.UNAUTHORIZED) {
            // Attempt to refresh token
            const baseAuthQuery = fetchBaseQuery({ baseUrl: `${baseUrl}/auth`, credentials: "include" }) as BaseQueryFn<string | FetchArgs, RefreshAuthResponse, FetchBaseQueryError, unknown, FetchBaseQueryMeta>;
            const refreshResult = await baseAuthQuery("/refresh", api, extraOptions);

            if (refreshResult.data?.status === "success") {
                result = await baseQuery(args, api, extraOptions);
            } else {
                api.dispatch(clearUser());
                // Expired refresh token should result in reauthentication
                if (refreshResult.meta?.response?.status === StatusCodes.FORBIDDEN) {
                    // TODO: Move this into a more stable process, possibly it's own api slice for /login & /logout
                    window.location.href = `${baseUrl}/auth/discord`;
                }
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
        authenticate: builder.query<User | undefined, void>({
            query: () => {
                const url = buildUrl("users/auth");
                return {
                    url,
                    method: "GET",
                    // 401 (eg. no authentication provided) is treated as an undefined user rather than an error
                    validateStatus: (response) => [StatusCodes.OK, StatusCodes.UNAUTHORIZED].includes(response.status) };
            },
            transformResponse: (response: User, meta: FetchBaseQueryMeta) => (meta?.response?.status === StatusCodes.UNAUTHORIZED ? undefined : response),
            providesTags: (result) => [
                ...mapTags(result, "me", (user) => user.discordId, false),
                ...mapTags(result?.roles, "role", (role) => role.discordId, false)
            ]
        }),
        getUsers: builder.query<IGetResponse<User>, IGetRequest<User> | void>({
            query: (options) => {
                const url = buildUrl("users", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results?.items, "user", (user) => user.discordId)
        }),
        getUser: builder.query<User, { discordId: string }>({
            query: (options) => {
                const { discordId } = options;
                const url = buildUrl(`users/${discordId}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result, "user", (user) => user.discordId, false)
        }),
        updateUser: builder.mutation<User, User>({
            query: (user) => {
                const url = buildUrl(`users/${user.discordId}`);
                return { url, method: "PUT", body: user };
            },
            invalidatesTags: (result) => [
                ...mapTags(result, "me", (user) => user.discordId, false),
                ...mapTags(result, "user", (user) => user.discordId)
            ]
        }),
        // Roles API
        getRoles: builder.query<IGetResponse<Role>, IGetRequest<Role> | void>({
            query: (options) => {
                const url = buildUrl("roles", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results?.items, "role", (role) => role.discordId)
        }),
        updateRole: builder.mutation<Role, Role>({
            query: (role) => {
                const url = buildUrl(`roles/${role.discordId}`);
                return { url, method: "PUT", body: role };
            },
            invalidatesTags: (result) => mapTags(result, "role", (role) => role.discordId)
        }),
        // Cards API
        getCards: builder.query<IGetResponse<IPlaytestCard>, IGetRequest<IPlaytestCard> | void>({
            query: (options) => {
                const url = buildUrl("cards", options);
                return { url, method: "GET" };
            },
            providesTags: (response) => mapTags(response?.items, "card", (card) => `${card.project}|${card.number}|${card.version}`)
        }),
        putDraftCard: builder.mutation<IPlaytestCard, IPlaytestCard>({
            query: (card) => {
                const url = buildUrl(`cards/${card.project}/${card.number}/draft`);
                const body = card;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => mapTags(result, "card", (card) => `${card.project}|${card.number}|${card.version}`)
        }),
        deleteDraft: builder.mutation<IPlaytestCard, IPlaytestCard>({
            query: (card) => {
                const url = buildUrl(`cards/${card.project}/${card.number}/draft`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => mapTags(result, "card", (card) => `${card.project}|${card.number}|${card.version}`)
        }),
        // Suggestions API
        getSuggestions: builder.query<IGetResponse<ICardSuggestion>, IGetRequest<ICardSuggestion> | void>({
            query: (options) => {
                const url = buildUrl("suggestions", options);
                return { url, method: "GET" };
            },
            providesTags: (response) => mapTags(response?.items, "suggestion", (suggestion) => suggestion.id)
        }),
        getSuggestionsBy: builder.query<IGetResponse<ICardSuggestion>, { discordId: string }>({
            query: (options) => {
                const url = buildUrl(`suggestions/${options.discordId}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result?.items, "suggestion", (suggestion) => suggestion.id)
        }),
        createSuggestion: builder.mutation<ICardSuggestion, Omit<ICardSuggestion, "created" | "updated">>({
            query: (suggestion) => {
                const url = buildUrl("suggestions");
                const body = suggestion;
                return { url, method: "POST", body };
            },
            invalidatesTags: [
                { type: "suggestion", id: "LIST" },
                { type: "tag", id: "LIST" }
            ]
        }),
        updateSuggestion: builder.mutation<ICardSuggestion, ICardSuggestion>({
            query: (suggestion) => {
                const url = buildUrl(`suggestions/${suggestion.id}`);
                const body = suggestion;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => [
                ...mapTags(result, "suggestion", (suggestion) => suggestion.id),
                ...(result ? [{ type: "tag" as ApiTag, id: "LIST" }] : [])
            ]
        }),
        deleteSuggestion: builder.mutation<ICardSuggestion, { id: string }>({
            query: (options) => {
                const url = buildUrl(`suggestions/${options.id}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => [
                ...mapTags(result, "suggestion", (suggestion) => suggestion.id),
                ...(result ? [{ type: "tag" as ApiTag, id: "LIST" }] : [])
            ]
        }),
        getTags: builder.query<string[], void>({
            query: () => {
                const url = buildUrl("suggestions/tags");
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results, "tag", (tag) => tag)
        }),
        // Render API
        renderImage: builder.mutation<string, IRenderCard>({
            query: (card) => {
                const body = card;
                const url = buildUrl("render", { format: "PNG", rounded: true });
                return {
                    url,
                    body,
                    method: "POST",
                    responseHandler: async (response) => {
                        if (response.status === StatusCodes.OK) {
                            const blob = await response.blob();
                            return URL.createObjectURL(blob);
                        }
                        return response;
                    }
                };
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
            providesTags: (results) => mapTags(results?.items, "project", (project) => project.number)
        }),
        getProject: builder.query<IProject, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result, "project", (project) => project.number, false)
        }),
        createProject: builder.mutation<IProject, Omit<IProject, "created" | "updated">>({
            query: (project) => {
                const url = buildUrl("projects");
                const body = project;
                return { url, method: "POST", body };
            },
            invalidatesTags: [{ type: "project", id: "LIST" }]
        }),
        initialiseProject: builder.mutation<{ project: IProject, cards: IPlaytestCard[] }, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}/initialise`);
                return { url, method: "POST" };
            },
            invalidatesTags: (result) => [
                ...mapTags(result?.project, "project", (project) => project.number),
                ...mapTags(result?.cards, "card", (card) => `${card.project}|${card.number}|${card.version}`)
            ]
        }),
        updateProject: builder.mutation<IProject, IProject>({
            query: (project) => {
                const url = buildUrl(`projects/${project.number}`);
                const body = project;
                return { url, method: "PUT", body };
            },
            invalidatesTags: (result) => mapTags(result, "project", (project) => project.number)
        }),
        deleteProject: builder.mutation<IProject, { number: number }>({
            query: (options) => {
                const url = buildUrl(`projects/${options.number}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => mapTags(result, "project", (project) => project.number)
        }),
        // Playtesting Update API (eg. Projects API)
        createPlaytestingUpdate: builder.mutation<{ playtestingUpdate: IPlaytestingUpdate, project: IProject, cards: IPlaytestCard[] }, Omit<IPlaytestingUpdate, "version" | "pullRequest" | "createdBy" | "created" | "updated">>({
            query: (playtestingUpdate) => {
                const url = buildUrl(`projects/${playtestingUpdate.project}/playtesting/update`);
                const body = playtestingUpdate;
                return { url, method: "POST", body };
            },
            // TODO: FIX THIS (ensure that, after a pt update is made, it invalidates all cards involved in that update)
            // Also (not related to here), there was a weird bug with updating Melisandre, where 1.3.1 got merged with a previous version. Investigate.
            invalidatesTags: (result) => [
                { type: "playtestingUpdate", id: "LIST" },
                ...mapTags(result?.cards, "card", (card) => `${card.project}|${card.number}|${card.version}`)
            ]
        }),
        // Reviews API
        getReview: builder.query<IPlaytestReview | undefined, { project: number, number: number, version: SemanticVersion, reviewer: string }>({
            query: (options) => {
                const url = buildUrl(`reviews/${options.project}/${options.number}/${options.version}/${options.reviewer}`);
                return { url, method: "GET" };
            },
            providesTags: (result) => mapTags(result, "review", (review) => `${review.project}|${review.number}|${review.version}|${review.reviewer}`)
        }),
        getReviews: builder.query<IGetResponse<IPlaytestReview>, IGetRequest<IPlaytestReview>>({
            query: (options) => {
                const url = buildUrl("reviews", options);
                return { url, method: "GET" };
            },
            providesTags: (results) => mapTags(results?.items, "review", (review) => `${review.project}|${review.number}|${review.version}|${review.reviewer}`)
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
            invalidatesTags: (result) => mapTags(result, "review", (review) => `${review.project}|${review.number}|${review.version}|${review.reviewer}`)
        }),
        deleteReview: builder.mutation<IPlaytestReview, { project: number, number: number, version: SemanticVersion, reviewer: string }>({
            query: (options) => {
                const url = buildUrl(`reviews/${options.project}/${options.number}/${options.version}/${options.reviewer}`);
                return { url, method: "DELETE" };
            },
            invalidatesTags: (result) => mapTags(result, "review", (review) => `${review.project}|${review.number}|${review.version}|${review.reviewer}`)
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
    useGetRenderJobQuery,

    useGetProjectsQuery,
    useGetProjectQuery,
    useCreateProjectMutation,
    useInitialiseProjectMutation,
    useUpdateProjectMutation,
    useDeleteProjectMutation,

    useCreatePlaytestingUpdateMutation,

    useGetReviewQuery,
    useLazyGetReviewQuery,
    useGetReviewsQuery,
    useCreateReviewMutation,
    useUpdateReviewMutation,
    useDeleteReviewMutation
} = api;

export default api;