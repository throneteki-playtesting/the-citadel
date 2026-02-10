import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { baseUrl } from ".";
import { Code, ILabeledCard } from "common/models/cards";
import { buildUrl } from "common/utils";
import { IDecklist } from "common/models/decks";
import { UUID } from "crypto";

const thronesdbApi = createApi({
    reducerPath: "thronesdbApi",
    baseQuery: fetchBaseQuery({ baseUrl: `${baseUrl}/thronesdb` }),
    endpoints: (builder) => ({
        getCard: builder.query<ILabeledCard, Code>({
            query: (code) => {
                const url = buildUrl(`card/${code}`);
                return { url, method: "GET" };
            }
        }),
        getDeck: builder.query<IDecklist, number | UUID>({
            query: (identifier) => {
                const url = buildUrl(`deck/${identifier}`);
                return { url, method: "GET" };
            }
        })
    })
});

export const {
    useGetCardQuery,
    useLazyGetCardQuery,
    useGetDeckQuery,
    useLazyGetDeckQuery
} = thronesdbApi;

export default thronesdbApi;