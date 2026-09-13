import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { Code, ILabeledCard } from "common/models/cards";
import { buildUrl } from "common/utils";
import { IDecklist } from "common/models/decks";
import { UUID } from "common/models/shared";
import { IGetRequest, IGetResponse } from "server/types";

const thronesdbApi = createApi({
    reducerPath: "thronesdbApi",
    baseQuery: fetchBaseQuery({ baseUrl: "/thronesdb" }),
    endpoints: (builder) => ({
        getTDBCard: builder.query<ILabeledCard, Code>({
            query: (code) => {
                const url = buildUrl(`card/${code}`);
                return { url, method: "GET" };
            }
        }),
        // Same filter/orderBy/page/perPage shape as every other list query - the pool cache/paging
        // live server-side in thronesDbCardPoolService, since ThronesDB's own API has neither.
        searchTDBCards: builder.query<IGetResponse<ILabeledCard>, IGetRequest<ILabeledCard> | void>({
            query: (options) => {
                const url = buildUrl("cards", options ?? undefined);
                return { url, method: "GET" };
            }
        }),
        getTDBDeck: builder.query<IDecklist | undefined, number | UUID>({
            query: (identifier) => {
                const url = buildUrl(`deck/${identifier}`);
                return { url, method: "GET" };
            }
        })
    })
});

export const {
    useGetTDBCardQuery,
    useLazyGetTDBCardQuery,
    useSearchTDBCardsQuery,
    useGetTDBDeckQuery,
    useLazyGetTDBDeckQuery
} = thronesdbApi;

export default thronesdbApi;
