import { ILogEntry } from "common/models/logs";

// Bridges the app-wide SSEProvider to whichever Logs page is currently mounted and listening.
type Listener = (entry: ILogEntry) => void;
const listeners = new Set<Listener>();

export function subscribeToLogCreates(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function emitLogCreate(entry: ILogEntry): void {
    listeners.forEach((listener) => listener(entry));
}

// True while a Logs page is live-consuming creates - lets the SSE provider skip a redundant cache invalidation.
export function hasLogListeners(): boolean {
    return listeners.size > 0;
}

// Fired when the SSE provider resyncs after a reconnect, so a mounted Logs page can reset its pagination.
const resyncListeners = new Set<() => void>();

export function subscribeToResync(listener: () => void): () => void {
    resyncListeners.add(listener);
    return () => resyncListeners.delete(listener);
}

export function emitResync(): void {
    resyncListeners.forEach((listener) => listener());
}
