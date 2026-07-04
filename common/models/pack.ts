import { SemanticVersion } from "common/utils";
import { ICard } from "./cards";

export type ReleaseDate = `${number}-${number}-${number}`;

export interface IPack {
    cgdbId?: string,
    code: string,
    name: string,
    releaseDate: ReleaseDate | null,
    workInProgress?: boolean,
    cards: ICard[]
}

export interface IPlaytestPack extends IPack {
    workInProgress: true,
    cards: (ICard & { version: SemanticVersion })[]
}