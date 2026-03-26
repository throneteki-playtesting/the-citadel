import { AsyncLocalStorage } from "async_hooks";
import { Integration, User } from "common/models/auth";

type RequestSource = "client" | "api" | "webhook" | "internal";

type RequestContext =
    | { source: "client"; principal: User; timestamp: Date; traceId: string }
    | { source: Exclude<RequestSource, "client">; principal: User | Integration; timestamp: Date; traceId: string }

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function createContext(source: "client", principal: User): RequestContext;
export function createContext(source: Exclude<RequestSource, "client">, principal: User | Integration): RequestContext;
export function createContext(source: RequestSource, principal: User | Integration): RequestContext {
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