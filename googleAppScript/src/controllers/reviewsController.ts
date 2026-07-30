import { DataSheet } from "../spreadsheets/spreadsheet";
import { ReviewSerializer } from "../spreadsheets/serializers/reviewSerializer";
import * as RestClient from "../restClient";
import { IPlaytestReview } from "common/models/reviews";
import { DeepPartial } from "common/types";

export function doGet(path: string[], e: GoogleAppsScript.Events.DoGet) {
    const { filter } = e.parameter;
    // Assume filter is in a valid partial format (eg. no error checking here!!!)
    const partial = JSON.parse(filter) as DeepPartial<IPlaytestReview>;
    const readFunc = (values: string[], index: number) => ReviewSerializer.instance.filter(values, index, partial);

    const reviews = DataSheet.sheets.review.read(readFunc);
    const response = { request: e, data: { reviews } } as RestClient.Response<ReadResponse>;
    return RestClient.generateResponse(response);
}
export function doPost(path: string[], e: GoogleAppsScript.Events.DoPost) {
    const { upsert, filter } = e.parameter;
    const reviews: IPlaytestReview[] = e.postData ? JSON.parse(e.postData.contents) : undefined;

    const action = path.shift();
    switch (action) {
        case "create": {
            const created = DataSheet.sheets.review.create(reviews);
            const response = { request: e, data: { created } } as RestClient.Response<CreateResponse>;
            return RestClient.generateResponse(response);
        }
        case "update": {
            const isUpsert = upsert === "true";
            const updated = DataSheet.sheets.review.update(reviews, false, isUpsert);
            const reponse = { request: e, data: { updated } } as RestClient.Response<UpdateResponse>;
            return RestClient.generateResponse(reponse);
        }
        case "destroy": {
            // Assume filter is in a valid partial format (eg. no error checking here!!!)
            const partial = JSON.parse(filter) as DeepPartial<IPlaytestReview>;
            const deleteFunc = (values: string[], index: number) => ReviewSerializer.instance.filter(values, index, partial);

            const destroyed = DataSheet.sheets.review.delete(deleteFunc);
            const response = { request: e, data: { destroyed } } as RestClient.Response<DestroyResponse>;
            return RestClient.generateResponse(response);
        }
        default:
            throw Error(`"${action}" is not a valid review post action`);
    }
}

export interface CreateResponse { created: IPlaytestReview[] }
export interface ReadResponse { reviews: IPlaytestReview[] }
export interface UpdateResponse { updated: IPlaytestReview[] }
export interface DestroyResponse { destroyed: IPlaytestReview[] }