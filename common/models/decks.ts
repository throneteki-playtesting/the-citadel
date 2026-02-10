import { UUID } from "crypto";
import { Code, Faction } from "./cards";
import { ISO8601String } from "common/types";

export interface IDecklist {
    id: number,
    uuid?: UUID,
    name: string,
    created: ISO8601String,
    updated: ISO8601String,
    description: string,
    userId: number,
    faction: Faction,
    slots: Record<Code, number>,
    agendas: Code[],
    version: `${number}.${number}`,
    tags?: string,
    url?: string
}