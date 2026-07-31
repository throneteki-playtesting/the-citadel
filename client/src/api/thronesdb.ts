import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { Code, ILabeledCard } from "common/models/cards";
import { buildUrl } from "common/utils";
import { IDecklist } from "common/models/decks";
import { UUID } from "common/models/shared";

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
        getTDBDeck: builder.query<IDecklist | undefined, number | UUID>({
            query: (identifier) => {
                const url = buildUrl(`deck/${identifier}`);
                return { url, method: "GET" };
            }
        })
    })
});

export const { useGetTDBCardQuery, useLazyGetTDBCardQuery, useGetTDBDeckQuery, useLazyGetTDBDeckQuery } = thronesdbApi;

export default thronesdbApi;
