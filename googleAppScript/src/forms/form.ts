import { getProperty, GooglePropertiesType } from "../settings";
import { Log } from "../cloudLogger";
import { SemanticVersion } from "common/utils";
import * as Forms from "../forms/form";
import * as RestClient from "../restClient";
import { IPlaytestReview } from "common/models/reviews";

export function get() {
    return FormApp.openById(getProperty(GooglePropertiesType.Script, "formId"));
}

export function toReviews(...formResponses: GoogleAppsScript.Forms.FormResponse[]) {
    const project = parseInt(getProperty(GooglePropertiesType.Script, "number"));

    const reviews: IPlaytestReview[] = [];
    for (const response of formResponses) {
        const items = response.getItemResponses();

        // Collect the number, name & version from ReviewingCard in regex groups
        const cardRegex = /(\d+) - (.+) \((.+)\)/gm;
        const groups = cardRegex.exec(items[Question.ReviewingCard].getResponse() as string);
        const number = parseInt(groups[1].trim());

        const decks = (items[Question.DeckLinks].getResponse() as string).split("\n").map((deck) => deck.trim()).filter((deck) => deck);
        const version = groups[3].trim() as SemanticVersion;

        const date = new Date(response.getTimestamp().toUTCString());
        const statements = items[Question.Statements].getResponse() as string[];
        const review = {
            reviewer: items[Question.DiscordName].getResponse() as string,
            project,
            number,
            version,
            decks,
            played: parseInt(items[Question.Played].getResponse() as string),
            statements: {
                boring: statements[Statements.Boring],
                competitive: statements[Statements.Competitive],
                creative: statements[Statements.Creative],
                balanced: statements[Statements.Balanced],
                releasable: statements[Statements.Releasable]
            },
            additional: items[Question.Additional].getResponse() as string || undefined,
            created: date,
            updated: date
        } as IPlaytestReview;

        reviews.push(review);
    }
    return reviews;
}

export function syncFormValues(cards: string[], reviewers: string[]) {
    const reviewerListItem = this.get().getItems()[Question.DiscordName].asListItem();
    reviewerListItem.setChoiceValues(reviewers);
    const cardListItem = this.get().getItems()[Question.ReviewingCard].asListItem();
    cardListItem.setChoiceValues(cards);
    return { cards, reviewers };
}

enum Question {
    DiscordName,
    ReviewingCard,
    DeckLinks,
    Played,
    Statements,
    Additional
}

enum Statements {
    Boring, // It is boring
    Competitive, // It will see competitive play
    Creative, // It inspires creative, fun or jank ideas
    Balanced, // It is balanced
    Releasable // It could be released as is
}

export function onSubmit(e: GoogleAppsScript.Events.FormsOnFormSubmit) {
    const reviews = Forms.toReviews(e.response);
    RestClient.post("reviews", reviews);
    Log.information(`Pushed review ${e.response.getId()} to API`);
}