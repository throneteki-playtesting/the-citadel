import { randomUUID } from "crypto";
import {
    CardLikeSnapshot,
    ILogEntry,
    ILogPrincipal,
    IntegrationSnapshot,
    LogCategory,
    LogSeverity,
    ProjectSnapshot,
    RoleSnapshot,
    UserSnapshot
} from "common/models/logs";
import { Principal } from "common/models/auth";
import { Faction, Type } from "common/models/cards";
import { SemanticVersion } from "common/utils";
import { requestContext } from "@/middleware/context";
import { dataService, logger } from "@/services";

function resolveContextPrincipal(): ILogPrincipal {
    const context = requestContext.getStore();
    if (!context) {
        return { type: "system", id: "system" };
    }
    return resolvePrincipal(context.principal);
}

function resolvePrincipal(principal: Principal): ILogPrincipal {
    if ("discordId" in principal) {
        return {
            type: "user",
            id: principal.discordId,
            displayname: principal.displayname,
            avatarUrl: principal.avatarUrl
        };
    }
    if ("name" in principal) {
        return { type: "integration", id: principal.id, name: principal.name };
    }
    return { type: "anonymous", id: "anonymous" };
}

// Snapshot builders - context holds a snapshot of relevant log data at time of log
export function cardSnapshot(
    id: string,
    card: { faction: Faction; type: Type; name: string; version?: SemanticVersion }
): CardLikeSnapshot {
    return { id, faction: card.faction, type: card.type, name: card.name, version: card.version };
}

export function projectSnapshot(project: { number: number; name: string }): ProjectSnapshot {
    return { id: String(project.number), name: project.name };
}

export function userSnapshot(user: { discordId: string; displayname: string; avatarUrl?: string }): UserSnapshot {
    return { id: user.discordId, displayname: user.displayname, avatarUrl: user.avatarUrl };
}

export function roleSnapshot(role: { discordId: string; name: string; color?: number }): RoleSnapshot {
    return { id: role.discordId, name: role.name, color: role.color };
}

export function integrationSnapshot(integration: { id: string; name: string }): IntegrationSnapshot {
    return { id: integration.id, name: integration.name };
}

export interface PlaceholderMapping {
    name: string;
    type: string | ((principal: ILogPrincipal) => string);
    key?: string;
    // Only needed for placeholders whose value can't come from a plain `context` entry (eg. the acting principal).
    resolveValue?: (principal: ILogPrincipal) => unknown;
}

const defaultPlaceholderMappings: PlaceholderMapping[] = [
    {
        name: "principal",
        type: (principal) => principal.type,
        resolveValue: (principal) => principal
    },
    {
        name: "targetUser",
        type: "user"
    }
];

const PLACEHOLDER_REGEX = /<([a-zA-Z]\w*)>/g;

export interface LogActivityOptions {
    principal?: ILogPrincipal;
    context?: Record<string, unknown>;
    details?: Record<string, unknown>;
    severity?: LogSeverity;
    placeholders?: PlaceholderMapping[];
}

export async function logActivity(
    category: LogCategory,
    action: string,
    message: string,
    options: LogActivityOptions = {}
): Promise<ILogEntry> {
    const principal = options.principal ?? resolveContextPrincipal();
    const mappings = [...(options.placeholders ?? []), ...defaultPlaceholderMappings];
    const context: Record<string, unknown> = { ...options.context };

    const resolvedMessage = message.replace(PLACEHOLDER_REGEX, (match, name: string) => {
        const mapping = mappings.find((m) => m.name === name);
        const type = mapping ? (typeof mapping.type === "function" ? mapping.type(principal) : mapping.type) : name;
        const key = mapping?.key ?? name;
        const value = mapping?.resolveValue ? mapping.resolveValue(principal) : context[key];

        if (value === undefined) {
            logger.warn(
                `[ActivityLog] "${action}" message references "<${name}>" with no matching context["${key}"] value`
            );
            return match;
        }

        context[key] = value;
        return `<${type}:{{${key}}}>`;
    });

    const entry: ILogEntry = {
        id: randomUUID(),
        category,
        action,
        principal,
        message: resolvedMessage,
        context,
        details: options.details,
        severity: options.severity ?? "info",
        created: new Date()
    };

    return dataService.logs.create(entry);
}
