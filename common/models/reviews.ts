import { DeckLink, DecklistLink } from "common/types";
import { SemanticVersion } from "../utils";
import { IAuditable } from "./shared";

export const statementAnswers = ["strongly disagree", "somewhat disagree", "neither agree nor disagree", "somewhat agree", "strongly agree"];
export type StatementAnswer = typeof statementAnswers[number];
export type Statements = {
    boring: StatementAnswer,
    competitive: StatementAnswer,
    creative: StatementAnswer,
    balanced: StatementAnswer,
    releasable: StatementAnswer
};

export interface IPlaytestReview extends IAuditable {
    reviewer: string,
    project: number,
    number: number,
    version: SemanticVersion,
    decks: (DeckLink | DecklistLink)[],
    played: number,
    statements: Statements,
    _metadata?: {
        discord?: {
            messageUrl?: string,
            lastSynced?: Date
        }
    },
    additional?: string
}

export enum StatementQuestions {
    boring = "It is boring",
    competitive = "It will see competitive play",
    creative = "It inspires creative, fun or jank ideas",
    balanced = "It is balanced",
    releasable = "It could be released as is"
}