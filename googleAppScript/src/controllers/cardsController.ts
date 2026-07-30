import { DataSheet } from "../spreadsheets/spreadsheet";
import { CardSerializer, CardSheet } from "../spreadsheets/serializers/cardSerializer";
import * as RestClient from "../restClient";
import { IPlaytestCard } from "common/models/cards";
import { DeepPartial } from "common/types";

export function doGet(path: string[], e: GoogleAppsScript.Events.DoGet) {
    const { latest, filter } = e.parameter;
    // Assume filter is in a valid partial format (eg. no error checking here!!!)
    const partial = JSON.parse(filter || "{}") as DeepPartial<IPlaytestCard>;
    const readFunc = (values: string[], index: number) => CardSerializer.instance.filter(values, index, partial);

    // Defaults to "archive" if latest is not given
    const sheet = latest?.toLowerCase() === "true" ? "latest" : "archive";
    const cards = DataSheet.sheets[sheet].read(readFunc);
    const response = { request: e, data: { cards } } as RestClient.Response<ReadResponse>;
    return RestClient.generateResponse(response);
}
export function doPost(path: string[], e: GoogleAppsScript.Events.DoPost) {
    const { sheets, upsert, filter } = e.parameter;
    const cards: IPlaytestCard[] = e.postData ? JSON.parse(e.postData.contents) : undefined;

    const action = path.shift();
    switch (action) {
        case "create": {
            // Creates cards in archive
            const created = DataSheet.sheets.archive.create(cards);
            const response = { request: e, data: { created } } as RestClient.Response<CreateResponse>;
            return RestClient.generateResponse(response);
        }
        case "update": {
            const isUpsert = upsert === "true";
            // Update specified sheet(s), or all sheets if none are specified
            const cardSheets = sheets?.split(",").map((sheet) => sheet as CardSheet) || ["archive"];
            const updated: IPlaytestCard[] = [];
            for (const sheet of cardSheets) {
                const sheetUpdates = DataSheet.sheets[sheet].update(cards, false, isUpsert);
                // Concat any cards that were updated & not already on updated list (by number/version)
                const newUpdates = sheetUpdates.filter((a) => !updated.some((b) => a.number === b.number && a.version === b.version));
                updated.concat(newUpdates);
            }
            const response = { request: e, data: { updated } } as RestClient.Response<UpdateResponse>;
            return RestClient.generateResponse(response);
        }
        case "destroy": {
            // Destroys cards from archive
            // Assume filter is in a valid partial format (eg. no error checking here!!!)
            const partial = JSON.parse(filter || "{}") as DeepPartial<IPlaytestCard>;
            const deleteFunc = (values: string[], index: number) => CardSerializer.instance.filter(values, index, partial);

            const destroyed = DataSheet.sheets.archive.delete(deleteFunc);
            const response = { request: e, data: { destroyed } } as RestClient.Response<DestroyResponse>;
            return RestClient.generateResponse(response);
        }
        default:
            throw Error(`"${action}" is not a valid card post action`);
    }
}

export interface CreateResponse { created: IPlaytestCard[] }
export interface ReadResponse { cards: IPlaytestCard[] }
export interface UpdateResponse { updated: IPlaytestCard[] }
export interface DestroyResponse { destroyed: IPlaytestCard[] }