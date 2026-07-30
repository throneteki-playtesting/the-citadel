import { Avatar, Skeleton } from "@heroui/react";
import {
    useGetCardQuery,
    useGetIntegrationsQuery,
    useGetProjectQuery,
    useGetRolesQuery,
    useGetSuggestionsQuery,
    useGetUserQuery
} from "../../../api";
import { SemanticVersion } from "common/utils";
import { Faction, Type } from "common/models/cards";
import { CardLikeSnapshot, IntegrationSnapshot, ProjectSnapshot, RoleSnapshot, UserSnapshot } from "common/models/logs";
import { factionBgClasses, factionBorderClasses } from "../../../constants";
import ThronesIcon from "../../../components/thronesIcon";
import classNames from "classnames";

// A snapshot `value` renders directly; a bare string is a pre-snapshot log id, falling back to a live lookup.
export function UserChip({ value }: { value: unknown }) {
    if (typeof value !== "string") {
        const snapshot = value as UserSnapshot;
        return (
            <span className="inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3">
                <Avatar size="sm" className="size-4" src={snapshot.avatarUrl} name={snapshot.displayname} />
                <span className="text-xs font-medium">{snapshot.displayname}</span>
            </span>
        );
    }
    return <LegacyUserChip discordId={value} />;
}

function LegacyUserChip({ discordId }: { discordId: string }) {
    const { data: user, isLoading } = useGetUserQuery({ discordId });

    if (isLoading) {
        return <Skeleton className="inline-block w-24 h-5 rounded-full align-middle" />;
    }

    return (
        <span className="inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3">
            <Avatar size="sm" className="size-4" src={user?.avatarUrl} name={user?.displayname ?? discordId} />
            <span className="text-xs font-medium">{user?.displayname ?? `Unknown User (${discordId})`}</span>
        </span>
    );
}

export function RoleChip({ value }: { value: unknown }) {
    if (typeof value !== "string") {
        const snapshot = value as RoleSnapshot;
        const hex = snapshot.color ? `#${snapshot.color.toString(16).padStart(6, "0")}` : undefined;
        return (
            <span
                className="inline-flex items-center align-middle px-2 py-0.5 rounded-full border text-xs font-medium border-content3"
                style={hex ? { backgroundColor: `${hex}33`, borderColor: `${hex}66`, color: hex } : undefined}
            >
                {snapshot.name}
            </span>
        );
    }
    return <LegacyRoleChip discordId={value} />;
}

function LegacyRoleChip({ discordId }: { discordId: string }) {
    const { data, isLoading } = useGetRolesQuery({ filter: { discordId } });
    const role = data?.items[0];

    if (isLoading) {
        return <Skeleton className="inline-block w-20 h-5 rounded-full align-middle" />;
    }

    const hex = role?.color ? `#${role.color.toString(16).padStart(6, "0")}` : undefined;

    return (
        <span
            className="inline-flex items-center align-middle px-2 py-0.5 rounded-full border text-xs font-medium border-content3"
            style={hex ? { backgroundColor: `${hex}33`, borderColor: `${hex}66`, color: hex } : undefined}
        >
            {role?.name ?? `Unknown Role (${discordId})`}
        </span>
    );
}

// Shared visual for anything backed by an `ICard` (faction colour + type icon + name), used by
// both the card chip itself and any entity that wraps a card (eg. suggestions).
function CardBadge({ faction, type, name, suffix }: { faction: Faction; type: Type; name: string; suffix?: string }) {
    return (
        <span
            className={classNames(
                "inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded-full border text-xs font-medium",
                factionBgClasses[faction],
                factionBorderClasses[faction]
            )}
        >
            <ThronesIcon name={type} />
            {name}
            {suffix ? ` (${suffix})` : ""}
        </span>
    );
}

export function CardChip({ value }: { value: unknown }) {
    if (typeof value !== "string") {
        const snapshot = value as CardLikeSnapshot;
        return (
            <CardBadge faction={snapshot.faction} type={snapshot.type} name={snapshot.name} suffix={snapshot.version} />
        );
    }
    return <LegacyCardChip id={value} />;
}

function LegacyCardChip({ id }: { id: string }) {
    const [projectPart, numberPart, version] = id.split("|");
    const project = Number(projectPart);
    const number = Number(numberPart);
    const { data: card, isLoading } = useGetCardQuery({
        project,
        number,
        version: version as SemanticVersion | "latest"
    });

    if (isLoading) {
        return <Skeleton className="inline-block w-24 h-5 rounded-full align-middle" />;
    }

    if (!card) {
        return <GenericEntityChip type="card" value={id} />;
    }

    return <CardBadge faction={card.faction} type={card.type} name={card.name} suffix={card.version} />;
}

export function SuggestionChip({ value }: { value: unknown }) {
    if (typeof value !== "string") {
        const snapshot = value as CardLikeSnapshot;
        return <CardBadge faction={snapshot.faction} type={snapshot.type} name={snapshot.name} />;
    }
    return <LegacySuggestionChip id={value} />;
}

function LegacySuggestionChip({ id }: { id: string }) {
    const { data, isLoading } = useGetSuggestionsQuery({ filter: { id } });
    const suggestion = data?.items[0];

    if (isLoading) {
        return <Skeleton className="inline-block w-24 h-5 rounded-full align-middle" />;
    }

    if (!suggestion) {
        return <GenericEntityChip type="suggestion" value={id} />;
    }

    return <CardBadge faction={suggestion.card.faction} type={suggestion.card.type} name={suggestion.card.name} />;
}

export function IntegrationChip({ value }: { value: unknown }) {
    if (typeof value !== "string") {
        const snapshot = value as IntegrationSnapshot;
        return (
            <span className="inline-flex items-center align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3 text-xs font-medium">
                {snapshot.name}
            </span>
        );
    }
    return <LegacyIntegrationChip id={value} />;
}

function LegacyIntegrationChip({ id }: { id: string }) {
    const { data, isLoading } = useGetIntegrationsQuery({ filter: { id } });
    const integration = data?.items[0];

    if (isLoading) {
        return <Skeleton className="inline-block w-24 h-5 rounded-full align-middle" />;
    }

    return (
        <span className="inline-flex items-center align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3 text-xs font-medium">
            {integration ? integration.name : `Unknown Integration (${id})`}
        </span>
    );
}

export function AnonymousChip() {
    return (
        <span className="inline-flex items-center align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3 text-xs font-medium">
            Anonymous
        </span>
    );
}

export function SystemChip() {
    return (
        <span className="inline-flex items-center align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3 text-xs font-medium">
            System
        </span>
    );
}

export function ProjectChip({ value }: { value: unknown }) {
    if (typeof value !== "string") {
        const snapshot = value as ProjectSnapshot;
        return (
            <span className="inline-flex items-center align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3 text-xs font-medium">
                {snapshot.name}
            </span>
        );
    }
    return <LegacyProjectChip id={value} />;
}

function LegacyProjectChip({ id }: { id: string }) {
    const number = Number(id);
    const { data: project, isLoading } = useGetProjectQuery({ number });

    if (isLoading) {
        return <Skeleton className="inline-block w-24 h-5 rounded-full align-middle" />;
    }

    return (
        <span className="inline-flex items-center align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3 text-xs font-medium">
            {project ? project.name : `Unknown Project (${id})`}
        </span>
    );
}

export function GenericEntityChip({ type, value }: { type: string; value: unknown }) {
    const display = typeof value === "string" ? value : JSON.stringify(value);
    return (
        <span className="inline-flex items-center align-middle px-2 py-0.5 rounded-full bg-content2 border border-content3 text-xs font-medium">
            {type}:{display}
        </span>
    );
}
