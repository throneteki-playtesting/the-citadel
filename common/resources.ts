import { ICardSuggestion, IPlaytestCard } from "./models/cards";
import { IPlaytestingUpdate, IProject } from "./models/projects";
import { IPlaytestReview } from "./models/reviews";
import { Role, SafeIntegration, User } from "./models/auth";
import { ISlot } from "./models/slots";
import { ILogEntry } from "./models/logs";
import { IDeck } from "./models/decks";

export type ResourceType = "user" | "role" | "integration" | "card" | "suggestion" | "project" | "playtestingUpdate" | "review" | "slot" | "log" | "deck";

export interface ResourceDataMap {
    user: User;
    role: Role;
    integration: SafeIntegration;
    card: IPlaytestCard;
    suggestion: ICardSuggestion;
    project: IProject;
    playtestingUpdate: IPlaytestingUpdate;
    review: IPlaytestReview;
    slot: ISlot;
    log: ILogEntry;
    deck: IDeck;
}

type ResourceIdKeys = {
    user: "discordId";
    role: "discordId";
    integration: "id";
    card: "project" | "number" | "version";
    suggestion: "id";
    project: "number";
    playtestingUpdate: "project" | "version";
    review: "project" | "number" | "version" | "reviewer";
    slot: "project" | "number";
    log: "id";
    deck: "identifier";
};

export const resourceIdFuncs: { [K in ResourceType]: (resource: Pick<ResourceDataMap[K], Extract<ResourceIdKeys[K], keyof ResourceDataMap[K]>>) => string } = {
    user: (u) => u.discordId,
    role: (r) => r.discordId,
    integration: (i) => i.id,
    card: (c) => `${c.project}|${c.number}|${c.version}`,
    suggestion: (s) => String(s.id),
    project: (p) => String(p.number),
    playtestingUpdate: (u) => `${u.project}|${u.version}`,
    review: (r) => `${r.project}|${r.number}|${r.version}|${r.reviewer}`,
    slot: (s) => `${s.project}|${s.number}`,
    log: (l) => l.id,
    deck: (d) => String(d.identifier)
};
