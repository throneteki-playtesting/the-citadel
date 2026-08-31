// _metadata.discord holds {messageUrl, lastSynced} pointing at a message in a specific Discord guild - it
// nests at varying depths (card/review/playtestingUpdate root, project.releases[], slot.statuses.design.checks[],
// suggestion root), so this walks the whole document rather than hardcoding a path per collection
function walk(value: unknown) {
    if (Array.isArray(value)) {
        value.forEach(walk);
        return;
    }
    if (value === null || typeof value !== "object" || value instanceof Date) {
        return;
    }

    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (key === "_metadata" && obj[key] && typeof obj[key] === "object") {
            delete (obj[key] as Record<string, unknown>)["discord"];
        }
        walk(obj[key]);
    }
}

export function stripDiscordMetadata<T>(doc: T): T {
    walk(doc);
    return doc;
}
