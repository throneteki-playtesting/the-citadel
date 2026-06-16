import { SemanticVersion } from "common/utils";
import { IAuditable } from "./shared";

export const types = ["cycle", "expansion"] as const;
export const githubStatuses = ["open", "closed"] as const;
export type Type = typeof types[number];
export type Code = `${number}`;

export interface IProject extends IAuditable {
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
    emoji?: string
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

export interface GithubPRMeta {
    status?: typeof githubStatuses[number],
    mergedAt?: Date,
    pullRequestUrl?: string,
    lastSynced?: Date
}

export interface IPlaytestingUpdate extends IAuditable {
    project: number,
    version: number,
    description?: string,
    cardChanges: Record<number, SemanticVersion>,
    _metadata?: {
        github?: {
            code?: GithubPRMeta,
            data?: GithubPRMeta
        }
    }
}