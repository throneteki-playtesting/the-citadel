import { maxEnum, SemanticVersion } from "common/utils";
import * as Review from "common/models/reviews";
import { getProperty, GooglePropertiesType } from "../../settings";
import { DataSerializer } from "./dataSerializer";
import { DeepPartial } from "common/types";

class ReviewSerializer extends DataSerializer<Review.IPlaytestReview> {
    richTextColumns: number[] = [ReviewColumn.Decks, ReviewColumn.Additional];
    public deserialize(values: string[]) {
        const project = parseInt(getProperty(GooglePropertiesType.Script, "number"));
        const model = {
            reviewer: values[ReviewColumn.Reviewer],
            project,
            number: parseInt(values[ReviewColumn.Number]),
            version: values[ReviewColumn.Version] as SemanticVersion,
            decks: values[ReviewColumn.Decks].split("\n").map((deck) => this.extractLinkText(deck, (link) => link)),
            played: parseInt(values[ReviewColumn.Played]),
            statements: {
                boring: values[ReviewColumn.Boring] as Review.StatementAnswer,
                competitive: values[ReviewColumn.Competitive] as Review.StatementAnswer,
                creative: values[ReviewColumn.Creative] as Review.StatementAnswer,
                balanced: values[ReviewColumn.Balanced] as Review.StatementAnswer,
                releasable: values[ReviewColumn.Releasable] as Review.StatementAnswer
            },
            additional: values[ReviewColumn.Additional] || undefined,
            created: new Date(values[ReviewColumn.Date]),
            updated: new Date(values[ReviewColumn.Date])
        } as Review.IPlaytestReview;

        return model;
    }

    public serialize(model: Review.IPlaytestReview) {
        const values: string[] = Array.from({ length: maxEnum(ReviewColumn) });
        values[ReviewColumn.Number] = model.number.toString();
        values[ReviewColumn.Version] = model.version;
        values[ReviewColumn.Date] = model.created.toLocaleString();
        values[ReviewColumn.Reviewer] = model.reviewer;
        values[ReviewColumn.Decks] = model.decks.map((deck, index) => `<a href="${deck}">Deck ${index + 1}</a>`).join("\n");
        values[ReviewColumn.Played] = model.played.toString();
        values[ReviewColumn.Boring] = model.statements.boring;
        values[ReviewColumn.Competitive] = model.statements.competitive;
        values[ReviewColumn.Creative] = model.statements.creative;
        values[ReviewColumn.Balanced] = model.statements.balanced;
        values[ReviewColumn.Releasable] = model.statements.releasable;
        values[ReviewColumn.Additional] = model.additional || "";

        return values;
    }

    public matches(values: string[], index: number, filter: DeepPartial<Review.IPlaytestReview>) {
        const compare = (a: number | string | boolean | undefined, b: number | string | boolean) => {
            if (!a) {
                return false;
            }
            return a.toString().toLowerCase() === b.toString().toLowerCase();
        };

        return (
            compare(filter.number, parseInt(values[ReviewColumn.Number]))
            && compare(filter.version, values[ReviewColumn.Version])
            && compare(filter.reviewer, values[ReviewColumn.Reviewer])
        );
    }
    public filter(values: string[], index: number, filter?: DeepPartial<Review.IPlaytestReview>) {
        if (!filter || Object.keys(filter).length === 0) {
            return true;
        }

        const compare = (a: number | string | boolean | undefined, b: number | string | boolean) => {
            if (!a) {
                return true;
            }
            if (typeof b === "boolean") {
                return a === b;
            }
            return a.toString().toLowerCase() === b.toString().toLowerCase();
        };
        return (
            compare(filter.number, parseInt(values[ReviewColumn.Number]))
            && compare(filter.version, values[ReviewColumn.Version])
            && compare(filter.reviewer, values[ReviewColumn.Reviewer])
            && compare(filter.played, parseInt(values[ReviewColumn.Played]))
            && compare(filter.statements?.boring, values[ReviewColumn.Boring])
            && compare(filter.statements?.competitive, values[ReviewColumn.Competitive])
            && compare(filter.statements?.creative, values[ReviewColumn.Creative])
            && compare(filter.statements?.balanced, values[ReviewColumn.Balanced])
            && compare(filter.statements?.releasable, values[ReviewColumn.Releasable])
            && compare(filter.additional, values[ReviewColumn.Additional])
            // More expensive checks at the end
            && (!filter.created || (filter.created as Date).toLocaleString() === values[ReviewColumn.Date])
            && (!filter.updated || (filter.updated as Date).toLocaleString() === values[ReviewColumn.Date])
            && (!filter.decks || values[ReviewColumn.Decks].split("\n").length === filter.decks.length) // TODO: Compare url's instead somehow
        );
    }
}

export enum ReviewColumn {
    Number,
    Version,
    Faction,
    Name,
    Date,
    Reviewer,
    Decks,
    Played,
    Boring,
    Competitive,
    Creative,
    Balanced,
    Releasable,
    Additional
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ReviewSerializer {
    export const instance = new ReviewSerializer();
}

export {
    ReviewSerializer
};