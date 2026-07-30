import { getProperty, GooglePropertiesType, setProperty } from "./settings";
import { CardSheet } from "./spreadsheets/serializers/cardSerializer";
import { safelyGetUI } from "./spreadsheets/userInput";

export function setAPIKey() {
    const response = safelyGetUI().prompt("Please provide API Key for web app:");
    setProperty(GooglePropertiesType.Document, "apiKey", Utilities.base64Encode(response.getResponseText()));
}

//TODO: Add get function, if its ever needed

export function post(subUrl: string, data: unknown) {
    const apiUrl = PropertiesService.getScriptProperties().getProperty("apiUrl");
    if (!apiUrl) {
        throw Error("Missing 'apiUrl' value in settings");
    }
    const apiKey = getProperty(GooglePropertiesType.Document, "apiKey");
    if (!apiKey) {
        throw Error("Missing 'apiKey'");
    }

    const url = `${apiUrl}/${subUrl}`;
    const options = {
        muteHttpExceptions: true,
        method: "post",
        headers: {
            Authorization: `Basic ${apiKey}`
        },
        contentType: "application/json",
        payload: JSON.stringify(data)
    } as GoogleAppsScript.URL_Fetch.URLFetchRequestOptions;

    const response = UrlFetchApp.fetch(url, options);

    const json = JSON.parse(response.getContentText());
    if (json.statusCode == 400) {
        // Currently configured to match "celebrate" validation from server
        if (json.message === "Validation failed") {
            throw Error("Failed server validation:\n" + JSON.stringify(json.validation));
        } else {
            throw Error("Failed request to server:\n" + response.getContentText());
        }
    }
    return json;
}

export type Sheet = CardSheet | "review";

export interface Response<T> {
    error?: object,
    request: GoogleAppsScript.Events.DoGet,
    data?: T
}

export function generateResponse<T>(resp: Response<T>) {
    return ContentService.createTextOutput(JSON.stringify(resp)).setMimeType(ContentService.MimeType.JSON);
}