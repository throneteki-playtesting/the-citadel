import { IAuditable } from "./shared";
import Permission from "./permissions";

export interface RefreshToken {
    discordId: string,
    sessionId: string,
    tokenHash: string,
    expiresAt: Date,
    createdAt: Date
}

export interface Anonymous extends IPrincipal {
    readonly id: "anonymous";
}

export type Principal = User | Integration | Anonymous;

interface IPrincipal {
    id: string;
    permissions: Permission[];
    roles: Role[];
}

export interface Role {
    discordId: string;
    active: boolean;
    name: string;
    color: number;
    position: number;
    hoist: boolean;
    icon: string | null;
    unicodeEmoji: string | null;
    permissions: Permission[];
}
export interface User extends IPrincipal {
    username: string,
    displayname: string,
    discordId: string,
    avatarUrl: string,
    lastLogin?: Date
}

export interface Integration extends IAuditable, IPrincipal {
    tokenHash: string;
    name: string;
    lastUsedAt?: Date;
    enabled: boolean;
}