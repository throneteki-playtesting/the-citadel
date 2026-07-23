import { AsyncLocalStorage } from "async_hooks";
import { Anonymous, ImpersonationType, Integration, User } from "common/models/auth";

type RequestSource = "client" | "api" | "webhook" | "internal" | "anonymous";

// For "client" sources, `principal` is the effective principal used for permission checks (which, while
// impersonating, is the target role/user) and `realPrincipal` is always the actual logged-in user.
type RequestContext =
    | { source: "client"; principal: User; realPrincipal: User; impersonating?: ImpersonationType; timestamp: Date; traceId: string; clientId?: string }
    | { source: "anonymous"; principal: Anonymous; timestamp: Date; traceId: string }
    | { source: Exclude<RequestSource, "client" | "anonymous">; principal: User | Integration; timestamp: Date; traceId: string }

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function createContext(source: "client", principal: User, realPrincipal: User, impersonating?: ImpersonationType, clientId?: string): RequestContext;
export function createContext(source: "anonymous", principal: Anonymous): RequestContext;
export function createContext(source: Exclude<RequestSource, "client" | "anonymous">, principal: User | Integration): RequestContext;
export function createContext(source: RequestSource, principal: User | Integration | Anonymous, realPrincipalOrClientId?: User | string, impersonating?: ImpersonationType, clientId?: string): RequestContext {
    return {
        source,
        principal,
        timestamp: new Date(),
        traceId: crypto.randomUUID(),
        ...(source === "client" ? { realPrincipal: realPrincipalOrClientId, impersonating, clientId } : {})
    } as RequestContext;
}

export function getContext() {
    const context = requestContext.getStore();
    if (!context) {
        throw new Error("Request context not found");
    }

    return context;
}