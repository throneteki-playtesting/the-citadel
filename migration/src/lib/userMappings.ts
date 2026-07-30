import fs from "fs";
import path from "path";
import { log } from "./logger";

const UNRESOLVED_PATH = path.resolve(process.cwd(), "unresolved-users.json");

export type UserMappingFile = {
    // username (as it appears in the DB) -> Discord user ID
    // Leave value as "" for ones you haven't resolved yet
    [username: string]: string;
};

export function loadUserMappings(): UserMappingFile {
    if (!fs.existsSync(UNRESOLVED_PATH)) return {};

    try {
        const raw = fs.readFileSync(UNRESOLVED_PATH, "utf-8");
        return JSON.parse(raw) as UserMappingFile;
    } catch {
        log.warn(`Could not parse ${UNRESOLVED_PATH} — ignoring`);
        return {};
    }
}

// Write (or merge into) the unresolved-users.json file.
// Preserves any mappings the user has already filled in.
export function writeUnresolvedUsers(unresolvedUsernames: string[]): void {
    const existing = loadUserMappings();

    const merged: UserMappingFile = { ...existing };
    for (const name of unresolvedUsernames) {
        if (!(name in merged)) {
            merged[name] = ""; // blank = needs filling in
        }
    }

    fs.writeFileSync(UNRESOLVED_PATH, JSON.stringify(merged, null, 2), "utf-8");
    log.warn(`${unresolvedUsernames.length} unresolved user(s) written to: ${UNRESOLVED_PATH}`);
    log.info("Fill in the Discord IDs and re-run with --resolve-users");
}

export function getResolvedMappings(): UserMappingFile {
    const mappings = loadUserMappings();
    // Only return entries that have been filled in
    return Object.fromEntries(Object.entries(mappings).filter(([, id]) => id.trim() !== ""));
}

export function hasUnresolvedMappings(): boolean {
    const mappings = loadUserMappings();
    return Object.values(mappings).some((id) => id.trim() === "");
}
