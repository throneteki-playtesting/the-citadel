import { AsyncLocalStorage } from "async_hooks";
import { Anonymous, Integration, User } from "common/models/auth";

type RequestSource = "client" | "api" | "webhook" | "internal" | "anonymous";

type RequestContext =
    | { source: "client"; principal: User; timestamp: Date; traceId: string }
    | { source: "anonymous"; principal: Anonymous; timestamp: Date; traceId: string }
    | { source: Exclude<RequestSource, "client" | "anonymous">; principal: User | Integration; timestamp: Date; traceId: string }

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function createContext(source: "client", principal: User): RequestContext;
export function createContext(source: "anonymous", principal: Anonymous): RequestContext;
export function createContext(source: Exclude<RequestSource, "client" | "anonymous">, principal: User | Integration): RequestContext;
export function createContext(source: RequestSource, principal: User | Integration | Anonymous): RequestContext {
    return {
        source,
        principal,
        timestamp: new Date(),
        traceId: crypto.randomUUID()
    } as RequestContext;
}

export function getContext() {
    const context = requestContext.getStore();
    if (!context) {
        throw new Error("Request context not found");
    }

    return context;
}