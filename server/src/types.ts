import { Filter, SingleOrArray, Sort } from "common/types";
import { StatusCodes } from "http-status-codes";
import { UUID } from "crypto";
import { IPlaytestCard, IRenderCard } from "common/models/cards";
import { IPlaytestingUpdate } from "common/models/projects";

export interface AccessTokenPayload {
    discordId: string,
    expiresAt: Date
}
export type AuthStatus = "success" | "error" | "cancelled";

export interface ApiError {
    code: StatusCodes,
    error: string,
    message: string,
}

export function isApiError(err: unknown): err is ApiError {
    return err instanceof Error && "code" in err && "message" in err && "error" in err;
}

export interface RefreshAuthResponse {
    status: "success" | "failure",
    message?: string
}

export interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface IRepository<T> {
    create(creating: T): Promise<T>;
    create(creating: T[]): Promise<T[]>;
    create(creating: SingleOrArray<T>): Promise<T> | Promise<T[]>;

    read(reading?: SingleOrArray<Filter<T>>, orderBy?: Sort<T>, page?: number, perPage?: number): Promise<T[]>;

    count(counting?: SingleOrArray<Filter<T>>): Promise<number>;

    update(updating: T, upsert?: boolean): Promise<T>;
    update(updating: T[], upsert?: boolean): Promise<T[]>;
    update(updating: SingleOrArray<T>, upsert?: boolean): Promise<T> | Promise<T[]>;

    destroy(destroying: SingleOrArray<Filter<T>>): Promise<T[]>;
}

export type RenderType = "single" | "batch";
export interface RenderJob { id: UUID, type: RenderType, data: { id: UUID, card: IRenderCard }[] };
export interface SingleRenderJob extends RenderJob { type: "single", options?: SingleRenderJobOptions };
export type SingleRenderJobOptions = { orientation?: "horizontal" | "vertical", rounded?: boolean };
export interface BatchRenderJob extends RenderJob { type: "batch", options?: BatchRenderJobOptions };
export type BatchRenderJobOptions = { copies?: number, perPage?: number, rounded?: boolean };

export interface IGetRequest<T> { filter?: SingleOrArray<Filter<T>>; orderBy?: Sort<T>; page?: number; perPage?: number; }
export interface IGetResponse<T> { total: number, items: T[] }

export interface IDeleteRequest<T> { filter?: SingleOrArray<Filter<T>> }
export interface IDeleteResponse<T> { total: number, deleted: T[] }


export type SyncType = "card" | "playtestingUpdate";
interface SyncDataMap {
    card: IPlaytestCard;
    playtestingUpdate: IPlaytestingUpdate;
}
interface SyncOperationMap {
    card: "image" | "discord" | "github";
    playtestingUpdate: "github";
}
export type SyncOperation<K extends SyncType = SyncType> = SyncOperationMap[K];
export type SyncStatus = "start" | "progress" | "complete" | "error";
interface BaseSyncEvent<K extends SyncType> {
    type: K;
    id: string;
    operation: SyncOperation<K>;
    status: SyncStatus;
    message?: string;
}

export interface SyncStartEvent<K extends SyncType> extends BaseSyncEvent<K> {
    status: "start";
}

export interface SyncProgressEvent<K extends SyncType> extends BaseSyncEvent<K> {
    status: "progress";
    step: string;
}

export interface SyncCompleteEvent<K extends SyncType> extends BaseSyncEvent<K> {
    status: "complete";
    data: SyncDataMap[K];
}

export interface SyncErrorEvent<K extends SyncType> extends BaseSyncEvent<K> {
    status: "error";
    error: string;
}

export type SyncEvent<K extends SyncType = SyncType> =
    | SyncStartEvent<K>
    | SyncProgressEvent<K>
    | SyncCompleteEvent<K>
    | SyncErrorEvent<K>;