import { Log } from "./cloudLogger";
import * as Cards from "./controllers/cardsController";
import * as Forms from "./controllers/formController";
import * as Projects from "./controllers/projectController";
import * as Reviews from "./controllers/reviewsController";
import { generateResponse } from "./restClient";

const getActions = {
    cards: Cards.doGet,
    project: Projects.doGet,
    reviews: Reviews.doGet,
    form: Forms.doGet
};
const postActions = {
    cards: Cards.doPost,
    project: Projects.doPost,
    reviews: Reviews.doPost,
    form: Forms.doPost
};

export function doGet(e: GoogleAppsScript.Events.DoGet) {
    try {
        const pathInfo = e.pathInfo || "";
        const path = pathInfo.split("/");

        if (path.length < 1) {
            throw Error("No path options given");
        }

        const pathAction = path.shift();
        const action = getActions[pathAction];

        if (!action) {
            throw Error(`"${pathAction}" is not a valid path option`);
        }

        return action(path, e);
    } catch (err) {
        Log.error(`Failed to process request:\n${err}`);
        return generateResponse({
            error: JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err))),
            request: e
        });
    }
};

export function doPost(e: GoogleAppsScript.Events.DoPost) {
    try {
        const pathInfo = e.pathInfo || "";
        const path = pathInfo.split("/");

        if (path.length < 1) {
            throw Error("No path options given");
        }
        const pathAction = path.shift();
        const action = postActions[pathAction];

        if (!action) {
            throw Error(`"${pathAction}" is not a valid path option`);
        }

        return action(path, e);
    } catch (err) {
        Log.error(`Failed to process request:\n${err}`);
        return generateResponse({
            error: JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err))),
            request: e
        });
    }
};