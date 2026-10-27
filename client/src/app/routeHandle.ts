import { ReactElement } from "react";

/** What a route tells the shell above it - its own loading skeleton, for while nothing beneath can draw yet */
export type RouteHandle = { fallback?: ReactElement };
