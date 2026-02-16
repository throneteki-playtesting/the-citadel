import { SemanticVersion } from "common/utils";

export const types = ["cycle", "expansion"] as const;
export type Type = typeof types[number];
export type Code = `${number}`;

export interface IProject {
    number: number,
    name: string,
    code: string,
    active: boolean,
    draft: boolean,
    description?: string,
    type: Type,
    script?: string, // TODO: Remove legacy script
    cardCount: FactionCardCount
    version: number,
    milestone?: number,
    mandateUrl?: string,
    formUrl?: string,
    emoji?: string,
    created: Date,
    updated: Date
}

export type FactionCardCount = {
    baratheon: number,
    greyjoy: number,
    lannister: number,
    martell: number,
    thenightswatch: number,
    stark: number,
    targaryen: number,
    tyrell: number,
    neutral: number
}

export interface IPlaytestingUpdate {
    project: number,
    version: number,
    description?: string,
    cardChanges: Record<number, SemanticVersion>,
    pullRequest?: string,
    createdBy: string,
    created: Date,
    updated: Date
}