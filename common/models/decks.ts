import { Code, Faction } from "./cards";
import { DeckLink, DecklistLink, ISO8601String } from "common/types";
import { SemanticVersion } from "../utils";
import { IAuditable, UUID } from "./shared";

export interface IDecklist {
    id: number;
    uuid?: UUID;
    name: string;
    created: ISO8601String;
    updated: ISO8601String;
    description: string;
    userId: number;
    faction: Faction;
    slots: Record<Code, number>;
    agendas: Code[];
    version: `${number}.${number}`;
    tags?: string;
    url?: string;
}

/** A deck persisted independently of any review; no regular card data stored */
export interface IDeck extends IAuditable {
    identifier: number | UUID;
    link: DeckLink | DecklistLink;
    name: string;
    faction: Faction;
    agendas: Code[];
    tdbVersion: `${number}.${number}`;
    tdbUpdated: ISO8601String;
    /** Non-draft version of each playtesting card in this deck, based on updated dates of deck & cards */
    cards: Record<Code, SemanticVersion>;
    /** How this deck was most recently added/refreshed */
    source: "manual" | "review";
}
