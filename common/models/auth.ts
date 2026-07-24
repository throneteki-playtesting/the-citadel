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
    defaultPermissions?: Permission[];
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
export type RoleWithUserCount = Role & { userCount: number };

/** Name of the Discord role that marks a user as a playtester; kept as a shared constant since it's checked in several places */
/** TODO: Move this into a "settings" page on the frontend instead of a constant */
export const PLAYTESTING_TEAM_ROLE_NAME = "Playtesting Team";

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
    ownerIds?: string[];
    internal?: boolean;
}

export type SafeIntegration = Omit<Integration, "tokenHash">;

// Server-side `error` string used to distinguish a mutation blocked by read-only impersonation from a normal 403
export const IMPERSONATION_READ_ONLY_ERROR = "Impersonation Read-Only";

export type ImpersonationType = "role" | "user";

export interface ImpersonationTarget {
    id: string;
    name: string;
    avatarUrl?: string;
    color?: number;
}

export interface ImpersonationInfo {
    type: ImpersonationType;
    target: ImpersonationTarget;
    realUser: ImpersonationTarget;
}

// Response shape for GET /users/me — a User, plus impersonation details when the session is viewing-as a role/user
export interface MeResponse extends User {
    impersonation?: ImpersonationInfo;
}