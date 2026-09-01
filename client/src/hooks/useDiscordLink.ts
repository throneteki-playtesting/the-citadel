import { useSyncExternalStore } from "react";

/**
 * Where a Discord link should land. Remembered per browser rather than detected: whether the desktop app
 * is installed cannot be asked, and every workaround for that opens both the app and the website.
 */
export type DiscordTarget = "browser" | "app";

const STORAGE_KEY = "discord.openIn";

const listeners = new Set<() => void>();
// Undefined until somebody has actually been asked, which is what separates "wants the website" from
// "has never said" - the two behave the same, but only one of them should be put the question
let choice: DiscordTarget | undefined = read();

function read(): DiscordTarget | undefined {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === "app" || stored === "browser" ? stored : undefined;
    } catch {
        // Private windows and blocked site data throw on access rather than returning nothing
        return undefined;
    }
}

export function setDiscordTarget(next: DiscordTarget) {
    choice = next;
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        // Nothing to remember it with, so it stands for this session alone
    }
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * What has actually been chosen, or undefined where nobody has been asked yet. One choice shared by every
 * Discord link on the page, so answering it anywhere answers it everywhere.
 */
export function useDiscordChoice(): DiscordTarget | undefined {
    return useSyncExternalStore(
        subscribe,
        () => choice,
        () => undefined
    );
}

/** Where a link should go right now - the website until told otherwise, since it works everywhere */
export function useDiscordTarget(): DiscordTarget {
    return useDiscordChoice() ?? "browser";
}

/**
 * The desktop client's address for a discord.com link, or undefined where there isn't one. The `-` is a
 * placeholder host, which is what lines the rest of the path up with the website's.
 */
export function toDiscordAppUrl(webUrl: string): string | undefined {
    try {
        const url = new URL(webUrl);
        if (url.hostname !== "discord.com" && !url.hostname.endsWith(".discord.com")) {
            return undefined;
        }
        return `discord://-${url.pathname}${url.search}`;
    } catch {
        return undefined;
    }
}

/** Sends the viewer to a discord.com link, wherever they have asked for those to open */
export function openDiscordLink(webUrl: string, target: DiscordTarget) {
    const appUrl = target === "app" ? toDiscordAppUrl(webUrl) : undefined;
    if (appUrl) {
        // In place, not a tab - browsers routinely refuse to open a custom scheme in one, leaving a blank
        window.location.href = appUrl;
        return;
    }
    window.open(webUrl, "_blank", "noreferrer");
}

/**
 * Where this link should actually point, given the choice this browser is remembering. `clientUrl` is the
 * client's address whether or not it is the one in use, so a caller can tell there is a choice to offer.
 */
export function useDiscordHref(webUrl: string) {
    const target = useDiscordTarget();
    const clientUrl = toDiscordAppUrl(webUrl);
    const appUrl = target === "app" ? clientUrl : undefined;
    return { href: appUrl ?? webUrl, isApp: !!appUrl, clientUrl };
}
