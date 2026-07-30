import { DeepPartial } from "common/types";
import * as CardsController from "../controllers/cardsController";
import * as RestClient from "../restClient";
import { run, test, testGroup } from "./runner";

function createFakeGoRequest(options?: DeepPartial<GoogleAppsScript.Events.DoGet>) {
    const defaults = {
        parameter: {},
        parameters: {},
        pathInfo: "",
        contextPath: "",
        contentLength: 0,
        queryString: ""
    };

    return { ...defaults, ...options } as GoogleAppsScript.Events.DoGet;
}

export function runTests() {
    // Cards Controller //
    testGroup("Card Controller", () => {
        test("read will collect all cards when no filter is given", () => {
            const fakeRequest = createFakeGoRequest({
                parameter: {}
            });

            const response = CardsController.doGet([], fakeRequest);
            const content = JSON.parse(response.getContent()) as RestClient.Response<CardsController.ReadResponse>;

            if (!content.data) {
                throw Error("No data in response");
            }
            if (!content.data.cards) {
                throw Error("No data.cards in response");
            }
        });

        test("read will collect specific card based on number & version", () => {
            const fakeRequest = createFakeGoRequest({
                parameter: {
                    latest: "false",
                    filter: JSON.stringify({ number: 1, version: "1.0.0" })
                }
            });

            const response = CardsController.doGet([], fakeRequest);
            const content = JSON.parse(response.getContent()) as RestClient.Response<CardsController.ReadResponse>;

            if (content.data.cards.length === 0) {
                throw Error("No cards have been found");
            }
            if (content.data.cards.some((card) => card.number !== 1 && card.version !== "1.0.0")) {
                throw Error("Invalid cards are being collected");
            }
        });

        // TODO: Write more tests
        // TODO: Maybe split tests up into individual files, and simply collect & run them in here.
        // TODO: Implement an "expects" rather than handling via errors, and include stacktrace for actual errors in fail message
    });

    run();
}