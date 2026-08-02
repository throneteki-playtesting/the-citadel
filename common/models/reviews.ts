import { DeckLink, DecklistLink } from "common/types";
import { SemanticVersion } from "../utils";
import { IAuditable } from "./shared";

export const statementAnswers = [
    "strongly disagree",
    "somewhat disagree",
    "neither agree nor disagree",
    "somewhat agree",
    "strongly agree"
];
export type StatementAnswer = (typeof statementAnswers)[number];

const NEUTRAL_ANSWER_INDEX = statementAnswers.indexOf("neither agree nor disagree");

function roundToNearestAnswer(average: number) {
    if (Math.abs(average % 1) !== 0.5) {
        return Math.round(average);
    }
    // An even split shouldn't read as agreement either way, so ties fall toward neutral
    return average < NEUTRAL_ANSWER_INDEX ? Math.ceil(average) : Math.floor(average);
}

/** The answer closest to the mean of those given, or undefined if there are none to average */
export function averageStatementAnswer(answers: StatementAnswer[]): StatementAnswer | undefined {
    const indexes = answers
        .map((answer) => statementAnswers.indexOf(answer.toLowerCase()))
        .filter((index) => index >= 0);
    if (indexes.length === 0) {
        return undefined;
    }

    const average = indexes.reduce((total, index) => total + index, 0) / indexes.length;
    return statementAnswers[roundToNearestAnswer(average)];
}
export type Statements = {
    boring: StatementAnswer;
    competitive: StatementAnswer;
    creative: StatementAnswer;
    balanced: StatementAnswer;
    releasable: StatementAnswer;
};

export interface ReviewDeck {
    link: DeckLink | DecklistLink;
    shared: boolean;
}

export interface IPlaytestReview extends IAuditable {
    reviewer: string;
    project: number;
    number: number;
    version: SemanticVersion;
    decks: ReviewDeck[];
    played: number;
    statements: Statements;
    _metadata?: {
        discord?: {
            messageUrl?: string;
            lastSynced?: Date;
        };
    };
    additional?: string;
}

export enum StatementQuestions {
    boring = "It is boring",
    competitive = "It will see competitive play",
    creative = "It inspires creative, fun or jank ideas",
    balanced = "It is balanced",
    releasable = "It could be released as is"
}
