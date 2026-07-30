import * as RestClient from "../restClient";
import * as Forms from "../forms/form";
import { IPlaytestReview } from "common/models/reviews";
import { DeepPartial } from "common/types";

export function doGet(path: string[], e: GoogleAppsScript.Events.DoGet) {
    const { filter } = e.parameter;
    // Assume filter is in a valid partial format (eg. no error checking here!!!)
    const partial = JSON.parse(filter || "{}") as DeepPartial<IPlaytestReview>;
    const responses = Forms.get().getResponses();
    const reviews = Forms.toReviews(...responses).filter((review) => matches(review, partial));
    const response = { request: e, data: { reviews } } as RestClient.Response<ReadReviewsResponse>;
    return RestClient.generateResponse(response);
}

function matches(review: IPlaytestReview, partial: DeepPartial<IPlaytestReview>) {
    return (
        (!partial.number || partial.number === review.number)
            && (!partial.version || partial.version === review.version)
            && (!partial.reviewer || partial.reviewer === review.reviewer)
            && (!partial.played || partial.played === review.played)
            && (!partial.statements?.boring || partial.statements.boring === review.statements.boring)
            && (!partial.statements?.competitive || partial.statements.competitive === review.statements.competitive)
            && (!partial.statements?.creative || partial.statements.creative === review.statements.creative)
            && (!partial.statements?.balanced || partial.statements.balanced === review.statements.balanced)
            && (!partial.statements?.releasable || partial.statements.releasable === review.statements.releasable)
            && (!partial.additional || partial.additional === review.additional)
            && (!partial.created || partial.created === review.created)
            && (!partial.updated || partial.updated === review.updated)
            && (!partial.decks || review.decks.some((deck) => partial.decks.some((fdeck) => deck === fdeck)))
    );
}

export function doPost(path: string[], e: GoogleAppsScript.Events.DoPost) {
    const { reviewers, cards } = JSON.parse(e.postData.contents) as { reviewers: string[], cards: string[] };
    const result = Forms.syncFormValues(cards, reviewers);
    const response = { request: e, data: { cards: result.cards.length, reviewers: result.reviewers.length } } as RestClient.Response<SetValuesResponse>;
    return RestClient.generateResponse(response);
}

export interface ReadReviewsResponse { reviews: IPlaytestReview[] }
export interface SetValuesResponse { cards: number, reviewers: number }