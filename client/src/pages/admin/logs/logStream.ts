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
