const STORAGE_KEY = "clientId";

let clientId: string | undefined;

// Persists per-tab across reloads and SSE reconnects.
export function getConnectionId() {
    if (!clientId) {
        clientId = sessionStorage.getItem(STORAGE_KEY) ?? crypto.randomUUID();
        sessionStorage.setItem(STORAGE_KEY, clientId);
    }
    return clientId;
}
