import { SemanticVersion } from "common/utils";
import { ICard } from "./cards";
import { ReleaseDate } from "./shared";

export type { ReleaseDate };

export interface IPack {
    cgdbId?: string;
    code: string;
    name: string;
    releaseDate: ReleaseDate | null;
    workInProgress?: boolean;
    cards: ICard[];
}

export interface IPlaytestPack extends IPack {
    workInProgress: true;
    cards: (ICard & { version: SemanticVersion })[];
}
