import { IAuditable } from "./shared";

export const artworkStatuses = ["pending", "acquiring", "confirming", "complete"] as const;
export const artworkTypes = ["sourced", "commissioned", "ai"] as const;

export type ArtworkStatus = (typeof artworkStatuses)[number];
export type ArtworkType = (typeof artworkTypes)[number];

// A single progression rather than separate flags - each state implies the ones before it
export const artworkContactStates = ["none", "contacted", "responded", "granted", "implied", "denied"] as const;
export type ArtworkContactState = (typeof artworkContactStates)[number];

export const paymentTypes = ["revolut", "paypal", "bankTransfer"] as const;
export type PaymentType = (typeof paymentTypes)[number];

// Advisory tweaks a piece needs before it is usable on a card - none of them hold a status back
export const artworkPrepFlags = ["upscaling", "outpainting", "cropping", "cleanup", "colour", "attribution"] as const;
export type ArtworkPrepFlag = (typeof artworkPrepFlags)[number];

/** One tweak, and whether it has been handled yet */
export interface IArtworkPrep {
    flag: ArtworkPrepFlag;
    done: boolean;
}

// One block per type rather than a union - switching type shouldn't discard fields already gathered
export interface IArtistPayment {
    type: PaymentType;
    revtag?: string;
    email?: string;
    accountName?: string;
    iban?: string;
    swiftBic?: string;
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
    payment?: IArtistPayment;
    notes?: string;
}

/** One candidate piece for a sourced artwork. Order within the options array is the display order */
export interface ISourcedOption {
    id: string;
    url: string;
    artist?: string;
    // Existing FFG artwork - recorded for the manager's judgement only, never satisfies the permission gate alone
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
    paid?: boolean;
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
    /** Discord id of whoever has taken this artwork on - one piece, one owner, not a list */
    assignee?: string;
    // Side by side rather than one union, so switching type mid-flight keeps what was gathered under the old one
    sourced?: ISourcedArtwork;
    commissioned?: ICommissionedArtwork;
    ai?: IAiArtwork;
    prep?: IArtworkPrep[];
}

// Reduced to what it actually states, so a draft that only re-set a field back to blank isn't dirty
export function comparableArtwork(artwork: IArtworkProgress): unknown {
    return pruneEmpty(artwork);
}

function pruneEmpty(value: unknown): unknown {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        const items = value.map(pruneEmpty);
        return items.length > 0 ? items : undefined;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .map(([key, entry]) => [key, pruneEmpty(entry)] as const)
            .filter(([, entry]) => entry !== undefined);
        return entries.length > 0 ? Object.fromEntries(entries) : undefined;
    }
    if (value === "" || value === false || value === null) {
        return undefined;
    }
    return value;
}

// What is wrong with a link, or undefined when nothing is (blank is always fine). For deciding whether a
// link is worth pointing an <img> at; validating one on the way in is the schema's job.
export function artworkUrlIssue(url?: string): string | undefined {
    if (!url || url.trim().length === 0) {
        return undefined;
    }
    try {
        const { protocol } = new URL(url.trim());
        return protocol === "http:" || protocol === "https:"
            ? undefined
            : "Enter a full link, starting with http:// or https://";
    } catch {
        return "Enter a full link, starting with http:// or https://";
    }
}

/** A sourced artwork with one more blank option on the end, ready to be filled in */
export function withAddedOption(sourced: ISourcedArtwork = { options: [] }): ISourcedArtwork {
    const option: ISourcedOption = { id: crypto.randomUUID(), url: "", contact: artworkContactStates[0] };
    return { ...sourced, options: [...sourced.options, option] };
}

/** The chosen option of a sourced artwork, if one has been picked */
export function selectedOption(sourced?: ISourcedArtwork): ISourcedOption | undefined {
    return sourced?.options.find((option) => option.id === sourced.selectedId);
}

// Blanket permission and implied both stand in for a granted reply
export function hasArtistPermission(option: ISourcedOption, artists: IArtist[]): boolean {
    if (option.contact === "granted" || option.contact === "implied") {
        return true;
    }
    const artist = artists.find((entry) => entry.id === option.artist);
    return !!artist?.blanketPermission;
}

/** Whether "implied" is available for this option - only once FFG artwork is actually recorded */
export function canImplyPermission(option: Pick<ISourcedOption, "ffg">): boolean {
    return !!option.ffg;
}

/** One thing an artwork needs before it counts as obtained, and whether it has been done */
export interface IArtworkRequirement {
    label: string;
    done: boolean;
}

// The single statement of the rules, in order - the gate below reports the first unmet one, so the
// checklist and the API's refusal can never disagree about what is left.
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

// Why artwork cannot reach `target` yet, or undefined when it can - shared so the API's refusal and the
// UI's blocked-step reason are always the same sentence.
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

// The status the artwork's details imply. Complete is never awarded automatically (a person must sign
// off), but is given up automatically once the artwork behind it is no longer there.
export function inferredStatus(artwork: IArtworkProgress, artists: IArtist[] = []): ArtworkStatus {
    if (!artwork.type) {
        return "pending";
    }
    // Advances exactly when the gate would allow it, so automation can never pick a status the API refuses
    const supported: ArtworkStatus = artworkBlocker(artwork, "confirming", artists) ? "acquiring" : "confirming";
    return artwork.status === "complete" && supported === "confirming" ? "complete" : supported;
}

// Why the artwork sits where it does, in the same words the gate uses - said out loud before a save
// moves the status, so a change under somebody is agreed to rather than noticed.
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

// Statuses a person may pick by hand - offered as a disabled option with its reason rather than refused
// after the fact, so the track can never be argued with.
export function selectableStatuses(
    artwork: IArtworkProgress,
    artists: IArtist[] = []
): { status: ArtworkStatus; blocker?: string }[] {
    return artworkStatuses.map((status) => ({ status, blocker: artworkBlocker(artwork, status, artists) }));
}

export function isPrepDone(prep: IArtworkPrep[] = []): boolean {
    return prep.every((entry) => entry.done);
}

/** No type means no piece to prepare, so prep set against an earlier attempt says nothing anywhere */
export function visiblePrep(artwork: IArtworkProgress): IArtworkPrep[] {
    return artwork.type ? (artwork.prep ?? []) : [];
}

/** Open checklist rows, all of prep counting as the one row the checklist draws it as */
export function remainingTasks(requirements: IArtworkRequirement[], prep: IArtworkPrep[] = []): number {
    return requirements.filter((requirement) => !requirement.done).length + (isPrepDone(prep) ? 0 : 1);
}

// Every checklist row ticked, prep included - prep never gates a status, but it does gate signing off
export function isChecklistDone(artwork: IArtworkProgress, artists: IArtist[] = []): boolean {
    return remainingTasks(artworkRequirements(artwork, artists), visiblePrep(artwork)) === 0;
}

// Drive share links point at a viewer page rather than the file, so an <img> pointed at one gets HTML
const DRIVE_HOSTS = [
    "drive.google.com",
    "docs.google.com",
    "drive.usercontent.google.com",
    "lh3.googleusercontent.com"
];

// /file/d/{id}/view, and lh3's bare /d/{id}
const DRIVE_PATH_ID = /\/(?:file\/)?d\/([\w-]+)/;

const DRIVE_ID = /^[\w-]+$/;

// The Drive file id in a share link - read from an `id` query parameter, or a `/file/d/{id}` path
export function driveFileId(url: string): string | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
    } catch {
        return undefined;
    }
    if (!DRIVE_HOSTS.includes(parsed.hostname)) {
        return undefined;
    }
    const param = parsed.searchParams.get("id");
    if (param && DRIVE_ID.test(param)) {
        return param;
    }
    return parsed.pathname.match(DRIVE_PATH_ID)?.[1];
}

// Every host worth pointing an <img> at, best first - Drive serves the same file from two hosts which
// fail independently, so trying both is what stops a piece that loaded yesterday reading as missing today.
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
