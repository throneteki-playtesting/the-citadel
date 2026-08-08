import { IAuditable } from "./shared";

export const artworkStatuses = ["pending", "acquiring", "confirming", "complete"] as const;
export const artworkTypes = ["sourced", "commissioned", "ai"] as const;

export type ArtworkStatus = (typeof artworkStatuses)[number];
export type ArtworkType = (typeof artworkTypes)[number];

/**
 * How far an approach to an artist has got. A single progression rather than separate flags, since each
 * state implies the ones before it - nobody responds without being contacted first.
 */
export const artworkContactStates = ["none", "contacted", "responded", "granted", "denied"] as const;
export type ArtworkContactState = (typeof artworkContactStates)[number];

/** Tweaks a piece needs before it is usable on a card. Advisory - none of them hold a status back */
export const artworkPrepFlags = ["upscaling", "outpainting", "cropping", "cleanup", "colour", "attribution"] as const;
export type ArtworkPrepFlag = (typeof artworkPrepFlags)[number];

/** One tweak, and whether it has been handled yet */
export interface IArtworkPrep {
    flag: ArtworkPrepFlag;
    done: boolean;
}

/** An artist, kept once and referenced by id from every artwork which involves them */
export interface IArtist extends IAuditable {
    id: string;
    name: string;
    /** Usually an email, but left free so anything reachable fits */
    contact?: string;
    portfolio?: string;
    /** Set for artists who have allowed all their work up front, so nobody re-asks each time */
    blanketPermission?: boolean;
    notes?: string;
}

/** One candidate piece for a sourced artwork. Order within the options array is the display order */
export interface ISourcedOption {
    id: string;
    url: string;
    artist?: string;
    /**
     * Existing game artwork owned by FFG. Recorded for the manager's judgement only - it never satisfies
     * the permission gate on its own
     */
    ffg?: boolean;
    contact: ArtworkContactState;
    notes?: string;
}

export interface ISourcedArtwork {
    options: ISourcedOption[];
    /** The chosen piece, which is also moved to the front of the options */
    selectedId?: string;
}

export interface IArtworkCost {
    amount: number;
    /** ISO 4217 code - commissions get paid in whatever the artist asks for */
    currency: string;
}

export interface ICommissionedArtwork {
    artist?: string;
    estimatedCompletion?: Date;
    /** Free text, since it is often several people or someone outside the server. Empty means GOT funded */
    paidBy?: string;
    cost?: IArtworkCost;
    url?: string;
    notes?: string;
}

export interface IAiArtwork {
    /** Discord id of whoever is generating it */
    generatedBy?: string;
    /** Whatever they are generating with, eg. Midjourney */
    resource?: string;
    url?: string;
    notes?: string;
}

export interface IArtworkProgress {
    status: ArtworkStatus;
    /** Chosen once work actually starts; unset while pending */
    type?: ArtworkType;
    /**
     * Details for each way artwork can be obtained. Kept side by side rather than as one union, so
     * switching type mid-flight never discards what was already gathered under the old one
     */
    sourced?: ISourcedArtwork;
    commissioned?: ICommissionedArtwork;
    ai?: IAiArtwork;
    prep?: IArtworkPrep[];
}

/**
 * What is wrong with a link, or undefined when nothing is. Blank is always fine - a piece being gathered
 * legitimately has no link yet. Mirrors the schema's Link rule, and is for deciding whether a link is
 * worth pointing an <img> at; validating one on the way in is the schema's job.
 */
export function artworkUrlIssue(url?: string): string | undefined {
    if (!url || url.trim().length === 0) {
        return undefined;
    }
    try {
        const { protocol } = new URL(url.trim());
        return protocol === "http:" || protocol === "https:" ? undefined : "Links must start with http:// or https://";
    } catch {
        return "Enter a full link, starting with http:// or https://";
    }
}

/** A sourced artwork with one more blank option on the end, ready to be filled in */
export function withAddedOption(sourced: ISourcedArtwork = { options: [] }): ISourcedArtwork {
    const option: ISourcedOption = { id: crypto.randomUUID(), url: "", contact: "none" };
    return { ...sourced, options: [...sourced.options, option] };
}

/** The chosen option of a sourced artwork, if one has been picked */
export function selectedOption(sourced?: ISourcedArtwork): ISourcedOption | undefined {
    return sourced?.options.find((option) => option.id === sourced.selectedId);
}

/**
 * Whether an option's artist has been cleared to use it. Blanket permission stands in for a granted
 * reply, since it was granted once for everything - see IArtist.blanketPermission
 */
export function hasArtistPermission(option: ISourcedOption, artists: IArtist[]): boolean {
    if (option.contact === "granted") {
        return true;
    }
    const artist = artists.find((entry) => entry.id === option.artist);
    return !!artist?.blanketPermission;
}

/** One thing an artwork needs before it counts as obtained, and whether it has been done */
export interface IArtworkRequirement {
    label: string;
    done: boolean;
}

/**
 * Everything this artwork needs before it counts as obtained, in the order it is worked through and
 * including what is already done. The single statement of the rules - the gate below reports the first
 * unmet one, so a checklist on screen and a refusal from the API can never disagree about what is left.
 *
 * Only the type is knowable while none is chosen; what follows depends entirely on which one it is.
 */
export function artworkRequirements(artwork: IArtworkProgress, artists: IArtist[] = []): IArtworkRequirement[] {
    const type: IArtworkRequirement = { label: "Choose how this artwork is being obtained", done: !!artwork.type };
    if (!artwork.type) {
        return [type];
    }
    return [type, ...acquiredRequirements(artwork.type, artwork, artists)];
}

function acquiredRequirements(type: ArtworkType, artwork: IArtworkProgress, artists: IArtist[]): IArtworkRequirement[] {
    switch (type) {
        case "sourced": {
            const chosen = selectedOption(artwork.sourced);
            return [
                { label: "Select one of the sourced options as the final artwork", done: !!chosen },
                {
                    label: "Get permission for the selected artwork",
                    done: !!chosen && hasArtistPermission(chosen, artists)
                }
            ];
        }
        case "commissioned": {
            return [
                { label: "Set the artist commissioned for this artwork", done: !!artwork.commissioned?.artist },
                { label: "Add a link to the finished commission", done: !!artwork.commissioned?.url }
            ];
        }
        case "ai": {
            return [{ label: "Add a link to the generated artwork", done: !!artwork.ai?.url }];
        }
    }
}

/**
 * Why artwork cannot reach `target` yet, or undefined when it can. Shared so the API's refusal and the
 * reason the UI shows against a blocked step are always the same sentence.
 */
export function artworkBlocker(
    artwork: IArtworkProgress,
    target: ArtworkStatus,
    artists: IArtist[] = []
): string | undefined {
    if (target === "pending") {
        return undefined;
    }
    const requirements = artworkRequirements(artwork, artists);
    // Acquiring only ever asks for the type; the rest is what obtaining the artwork means
    const relevant = target === "acquiring" ? requirements.slice(0, 1) : requirements;
    return relevant.find((requirement) => !requirement.done)?.label;
}

/**
 * The status the artwork's own details imply, so the track follows the work rather than being driven by
 * hand. Complete is never awarded automatically - signing a piece off is a person's statement - but it is
 * given up automatically, since a card can't stay finished once the artwork behind it has gone.
 *
 * Regression is the point: clearing a final artwork drops Confirming back to Acquiring, so the track can
 * never claim work which is no longer there.
 */
export function inferredStatus(artwork: IArtworkProgress, artists: IArtist[] = []): ArtworkStatus {
    if (!artwork.type) {
        return "pending";
    }
    // Advances exactly when the gate would allow it, so automation can never pick a status the API refuses
    const supported: ArtworkStatus = artworkBlocker(artwork, "confirming", artists) ? "acquiring" : "confirming";
    return artwork.status === "complete" && supported === "confirming" ? "complete" : supported;
}

/**
 * Why the artwork sits where it does, in the same words the gate uses. Said out loud before a save which
 * moves the status, so a track changing under somebody is something they agreed to rather than noticed.
 */
export function statusReason(artwork: IArtworkProgress, artists: IArtist[] = []): string {
    if (!artwork.type) {
        return "No artwork type has been chosen";
    }
    return artworkBlocker(artwork, "confirming", artists) ?? "The final artwork is in place and permitted";
}

/** Re-derives the status after a change to the artwork's details */
export function withInferredStatus(artwork: IArtworkProgress, artists: IArtist[] = []): IArtworkProgress {
    const status = inferredStatus(artwork, artists);
    return status === artwork.status ? artwork : { ...artwork, status };
}

/**
 * Which statuses a person may pick by hand right now. Everything the data supports, plus Complete once
 * the artwork is actually in hand - offered as a disabled option with its reason rather than refused
 * after the fact, so the track can never be argued with.
 */
export function selectableStatuses(
    artwork: IArtworkProgress,
    artists: IArtist[] = []
): { status: ArtworkStatus; blocker?: string }[] {
    return artworkStatuses.map((status) => ({ status, blocker: artworkBlocker(artwork, status, artists) }));
}

/** Prep which has been flagged but not yet handled. Surfaced as a warning, never as a blocker */
export function outstandingPrep(artwork: IArtworkProgress): ArtworkPrepFlag[] {
    return (artwork.prep ?? []).filter((entry) => !entry.done).map((entry) => entry.flag);
}

// Drive share links point at a viewer page rather than the file, so an <img> pointed at one gets HTML
const DRIVE_FILE_PATTERNS = [
    /drive\.google\.com\/file\/d\/([\w-]+)/,
    /drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^#]*&)?id=([\w-]+)/,
    /lh3\.googleusercontent\.com\/d\/([\w-]+)/
];

/** The Drive file id in a share link, if it is one */
export function driveFileId(url: string): string | undefined {
    for (const pattern of DRIVE_FILE_PATTERNS) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return undefined;
}

/**
 * Every host worth pointing an <img> at for this url, best first. A Google Drive share link needs
 * rewriting because it addresses a viewer page rather than the file, and Drive serves the same file from
 * two hosts which fail independently - the thumbnail service is quick and reliable but caps out at its
 * largest size, while the image host serves the original and is the one which rate limits. Trying them
 * in turn is what stops a piece which loaded yesterday reading as missing today.
 *
 * Either only works while the file is shared with anyone holding the link, so a Drive image which won't
 * load from either is nearly always a sharing setting rather than a broken link.
 */
export function displayableUrls(url?: string): string[] {
    if (!url) {
        return [];
    }
    const id = driveFileId(url);
    if (!id) {
        return [url];
    }
    return [`https://drive.google.com/thumbnail?id=${id}&sz=w1600`, `https://lh3.googleusercontent.com/d/${id}`];
}

/** The artwork url a card would actually use, whichever way it was obtained */
export function finalArtworkUrl(artwork: IArtworkProgress): string | undefined {
    switch (artwork.type) {
        case "sourced":
            return selectedOption(artwork.sourced)?.url;
        case "commissioned":
            return artwork.commissioned?.url;
        case "ai":
            return artwork.ai?.url;
        default:
            return undefined;
    }
}
