import { Faction, Type } from "./cards";
import { SemanticVersion } from "../utils";

export enum LogCategory {
    AUTH = "auth",
    USER = "user",
    ROLE = "role",
    INTEGRATION = "integration",
    PROJECT = "project",
    RELEASE = "release",
    SLOT = "slot",
    ARTIST = "artist",
    PLAYTESTING_UPDATE = "playtestingUpdate",
    CARD = "card",
    REVIEW = "review",
    SUGGESTION = "suggestion",
    SYSTEM = "system"
}

export const logCategories = Object.values(LogCategory);

export type LogSeverity = "info" | "warn" | "error";
export const logSeverities: LogSeverity[] = ["info", "warn", "error"];

export type LogPrincipalType = "user" | "integration" | "anonymous" | "system";

export interface ILogPrincipal {
    type: LogPrincipalType;
    id: string;
    displayname?: string; // user only
    avatarUrl?: string; // user only
    name?: string; // integration only
}

// Snapshot of an entity as it was when the log was written, not resolved live.
export interface CardLikeSnapshot {
    id: string;
    faction: Faction;
    type: Type;
    name: string;
    version?: SemanticVersion; // present for real cards, absent for suggestion cards
}
export interface ProjectSnapshot {
    id: string;
    name: string;
}
export interface UserSnapshot {
    id: string;
    displayname: string;
    avatarUrl?: string;
}
export interface RoleSnapshot {
    id: string;
    name: string;
    color?: number;
}
export interface IntegrationSnapshot {
    id: string;
    name: string;
}

export interface ILogEntry {
    id: string;
    category: LogCategory;
    action: string;
    principal: ILogPrincipal;
    message: string;
    context: Record<string, unknown>;
    details?: Record<string, unknown>;
    severity: LogSeverity;
    created: Date;
}

// Matches <type:{{key}}> placeholders in a log message; key looks up the entity in `context`.
export const LOG_PLACEHOLDER_REGEX = /<(\w+):\{\{(\w+)\}\}>/g;
