let connectionId: string | undefined;

export function setConnectionId(id: string) {
    connectionId = id;
}

export function getConnectionId() {
    return connectionId;
}
