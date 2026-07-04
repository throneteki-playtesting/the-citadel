import { ICardSuggestion, IPlaytestCard } from "./models/cards";
import { IPlaytestingUpdate, IProject } from "./models/projects";
import { IPlaytestReview } from "./models/reviews";
import { Role, SafeIntegration, User } from "./models/auth";

export type ResourceType = "user" | "role" | "integration" | "card" | "suggestion" | "project" | "playtestingUpdate" | "review";

export interface ResourceDataMap {
    user: User;
    role: Role;
    integration: SafeIntegration;
    card: IPlaytestCard;
    suggestion: ICardSuggestion;
    project: IProject;
    playtestingUpdate: IPlaytestingUpdate;
    review: IPlaytestReview;
}

export const resourceIdFuncs: { [K in ResourceType]: (resource: ResourceDataMap[K]) => string } = {
    user: (u) => u.discordId,
    role: (r) => r.discordId,
    integration: (i) => i.id,
    card: (c) => `${c.project}|${c.number}|${c.version}`,
    suggestion: (s) => String(s.id),
    project: (p) => String(p.number),
    playtestingUpdate: (u) => `${u.project}|${u.version}`,
    review: (r) => `${r.project}|${r.number}|${r.version}|${r.reviewer}`
};
