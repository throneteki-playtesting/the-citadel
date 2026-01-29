import { DeepPartial, SingleOrArray, Sortable } from "common/types";
import { StatusCodes } from "http-status-codes";
import { UUID } from "crypto";
import { IRenderCard } from "common/models/cards";

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

export interface IRepository<T> {
    create(creating: T): Promise<T>;
    create(creating: T[]): Promise<T[]>;
    create(creating: SingleOrArray<T>): Promise<T> | Promise<T[]>;

    read(reading?: SingleOrArray<DeepPartial<T>>, orderBy?: Sortable<T>, page?: number, perPage?: number): Promise<T[]>;

    count(counting?: SingleOrArray<DeepPartial<T>>): Promise<number>;

    update(updating: T, upsert?: boolean): Promise<T>;
    update(updating: T[], upsert?: boolean): Promise<T[]>;
    update(updating: SingleOrArray<T>, upsert?: boolean): Promise<T> | Promise<T[]>;

    destroy(destroying: SingleOrArray<DeepPartial<T>>): Promise<T[]>;
}

export type RenderType = "single" | "batch";
export interface RenderJob { id: UUID, type: RenderType, data: { id: UUID, card: IRenderCard }[] };
export interface SingleRenderJob extends RenderJob { type: "single", options?: SingleRenderJobOptions };
export type SingleRenderJobOptions = { orientation?: "horizontal" | "vertical", rounded?: boolean };
export interface BatchRenderJob extends RenderJob { type: "batch", options?: BatchRenderJobOptions };
export type BatchRenderJobOptions = { copies?: number, perPage?: number, rounded?: boolean };

export interface IGetRequest<T> { filter?: SingleOrArray<DeepPartial<T>>, orderBy?: Sortable<T>, page?: number, perPage?: number }
export interface IGetResponse<T> { total: number, items: T[] }

export interface IDeleteRequest<T> { filter?: SingleOrArray<DeepPartial<T>> }
export interface IDeleteResponse<T> { total: number, deleted: T[] }