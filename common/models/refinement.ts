import { gt } from "semver";
import { SemanticVersion } from "../utils";
import { IAuditable } from "./shared";

// One scale rather than a kind/severity pair - the first two assert that nothing is wrong yet, which is
// the whole point of raising them, and splitting that across two fields would make every raise ask twice
export const inquirySeverities = [
    "unchecked",
    "needsConfirmation",
    "recommendation",
    "minorProblem",
    "majorProblem"
] as const;
export const inquiryStatuses = ["open", "resolved", "rejected"] as const;

export type InquirySeverity = (typeof inquirySeverities)[number];
export type InquiryStatus = (typeof inquiryStatuses)[number];

// Shared rather than kept beside the client's icons and colours, since the forum names its tags after
// these - a tag which no longer matches is a tag nothing can be filed under
export const inquirySeverityLabels: Record<InquirySeverity, string> = {
    unchecked: "Unchecked",
    needsConfirmation: "Needs Confirmation",
    recommendation: "Recommendation",
    minorProblem: "Minor Problem",
    majorProblem: "Major Problem"
};

/** Doubles as the Discord thread name, so it stays a headline rather than the inquiry itself */
export const INQUIRY_SUMMARY_MAX = 60;

/** Why an inquiry was closed. `by` may differ from whoever raised it, which is why a note is asked for */
export interface IInquiryResolution {
    by: string;
    at: Date;
    /** Rich text. Absent only where a card update had already claimed the fix, which is the record instead */
    note?: string;
}

/** A decision that the card stays as it is - the counterpart to `addressedIn`, and likewise not a close */
export interface IInquiryNoChange {
    by: string;
    at: Date;
    /** Rich text */
    note: string;
}

/** One point raised against a card during refinement, numbered per card from 1 */
export interface IRefinementInquiry extends IAuditable {
    inquiry: number;
    /** The card this was raised against - the slot's final card, which may be a release-bound draft */
    version: SemanticVersion;
    /** Set by a card update claiming to fix this; it still awaits somebody resolving it officially */
    addressedIn?: SemanticVersion;
    /** Set by deciding the card stays as it is. Never held alongside `addressedIn` - the latest decision wins */
    noChange?: IInquiryNoChange;
    severity: InquirySeverity;
    status: InquiryStatus;
    /** Plain text - it is the Discord thread's name */
    summary: string;
    /** Rich text */
    detail?: string;
    resolution?: IInquiryResolution;
    _metadata?: {
        /** Only ever set once somebody starts a discussion; absence means no thread exists */
        discord?: {
            messageUrl?: string;
            /** Who opened the thread - not necessarily whoever raised the inquiry */
            startedBy?: string;
            lastSynced?: Date;
        };
    };
}

/** One person's assertion that they have looked a card over during refinement */
export interface IRefinementCheck extends IAuditable {
    /** Card version checked, stamped server side - for the record only, as an update does not undo a check */
    version: SemanticVersion;
}

/** A release check only counts while it matches the card it was made against */
export function isCheckStale(entry: { version: SemanticVersion }, latest?: SemanticVersion) {
    return !!latest && entry.version !== latest;
}

export function isInquiryOpen(inquiry: IRefinementInquiry) {
    return inquiry.status === "open";
}

/** An open, undecided inquiry raised against a card which has since moved on */
export function isInquiryStale(inquiry: IRefinementInquiry, current?: SemanticVersion) {
    if (!current || !isInquiryOpen(inquiry)) {
        return false;
    }
    return !inquiryDecision(inquiry) && inquiry.version !== current;
}

/**
 * The card a version names is gone - versions only climb, so one ahead of the card refinement measures
 * against can only be a deleted draft. Works from that one version rather than the whole version list.
 */
export function isVersionWithdrawn(version?: SemanticVersion, current?: SemanticVersion) {
    return !!version && !!current && gt(version, current);
}

/**
 * Addressed by an update and waiting on somebody to confirm it - shown in place of the stale marker.
 * Not measured against the current card, since the addressing draft is rarely the slot's final card yet.
 */
export function isInquiryAddressed(inquiry: IRefinementInquiry) {
    return isInquiryOpen(inquiry) && !!inquiry.addressedIn;
}

/** The inquiry claimed by an update, replacing any no-change decision - the latest decision wins */
export function withAddressedIn(inquiry: IRefinementInquiry, version: SemanticVersion): IRefinementInquiry {
    const claimed = { ...inquiry, addressedIn: version };
    delete claimed.noChange;
    return claimed;
}

/** The inquiry decided as no change, replacing any update's claim - the latest decision wins */
export function withNoChange(inquiry: IRefinementInquiry, noChange: IInquiryNoChange): IRefinementInquiry {
    const decided = { ...inquiry, noChange };
    delete decided.addressedIn;
    return decided;
}

export function isInquiryNoChange(inquiry: IRefinementInquiry) {
    return isInquiryOpen(inquiry) && !!inquiry.noChange;
}

export type InquiryDecision = "addressed" | "noChange";

/** What has been decided for an open inquiry, if anything */
export function inquiryDecision(inquiry: IRefinementInquiry): InquiryDecision | undefined {
    if (isInquiryAddressed(inquiry)) {
        return "addressed";
    }
    if (isInquiryNoChange(inquiry)) {
        return "noChange";
    }
    return undefined;
}

/** An open inquiry with a Discord thread */
export function isInquiryDiscussing(inquiry: IRefinementInquiry) {
    return isInquiryOpen(inquiry) && !!inquiry._metadata?.discord?.messageUrl;
}

/** Open with nothing decided yet */
export function isInquiryUnhandled(inquiry: IRefinementInquiry) {
    return isInquiryOpen(inquiry) && !inquiryDecision(inquiry);
}

// What a link to an inquiry may ask the page to open on arrival
export const inquiryLinkActions = ["resolve", "noChange"] as const;
export type InquiryLinkAction = (typeof inquiryLinkActions)[number];

/** The card page's refinement tab, landing on one inquiry - relative, so each side adds its own host */
export function inquiryLinkPath(project: number, number: number, inquiry: number, action?: InquiryLinkAction) {
    const params = new URLSearchParams({ tab: "refinement", inquiry: String(inquiry) });
    if (action) {
        params.set("action", action);
    }
    return `/project/${project}/${number}?${params}`;
}

/**
 * The number a card's next inquiry takes. Deleting the highest one frees its number again - it is an id
 * within the card, and a deleted inquiry's thread is closed off rather than left pointing at it
 */
export function nextInquiryNumber(inquiries: IRefinementInquiry[]) {
    return inquiries.reduce((highest, entry) => Math.max(highest, entry.inquiry), 0) + 1;
}

export interface IRefinementRequirement {
    label: string;
    /** A tally the label alone cannot carry - drawn dimmed beside it, as artwork's prep flags are */
    detail?: string;
    done: boolean;
}

/**
 * The most rows the checklist can ever produce at once - only the always-present check is guaranteed,
 * the other two each answer for something a card may not have. Sizes a list to this so a column aligns.
 */
export const MAX_REFINEMENT_REQUIREMENTS = 3;

// What refinement still needs before a card's design can be called complete. Every entry works out
// whether it is met, so the checklist on screen and the API's refusal are reading the same thing
export function refinementRequirements(
    inquiries: IRefinementInquiry[],
    checks: IRefinementCheck[],
    current?: SemanticVersion
): IRefinementRequirement[] {
    const open = inquiries.filter(isInquiryOpen);
    const requirements: IRefinementRequirement[] = [
        {
            label: "Have at least one person check this card",
            done: checks.length > 0
        }
    ];

    // A card nobody has raised anything against has nothing to resolve - a row ticked green for the
    // absence of work reads as work done, and inflates every count it appears in
    if (inquiries.length > 0) {
        requirements.push({
            label: "Resolve every inquiry on this card",
            // Counted up, as a tally of work done rather than of work left - every other row here is
            // ticked when it is finished, and 0/4 beside a green tick would read as the opposite
            detail: `${inquiries.length - open.length}/${inquiries.length}`,
            done: open.length === 0
        });
    }

    // Only asked for once the card has actually moved on under something still open - a card nobody has
    // changed has nothing to re-check, and a row saying so would read as work outstanding
    if (open.some((inquiry) => isInquiryStale(inquiry, current))) {
        requirements.push({ label: "Re-check inquiries raised against an older version", done: false });
    }
    return requirements;
}

// Why a card's design cannot be completed yet, or undefined when it can - shared so the API's refusal
// and the on-screen reason are the same sentence
export function refinementBlocker(
    inquiries: IRefinementInquiry[],
    checks: IRefinementCheck[],
    current?: SemanticVersion
): string | undefined {
    return refinementRequirements(inquiries, checks, current).find((requirement) => !requirement.done)?.label;
}

export function isRefinementDone(
    inquiries: IRefinementInquiry[],
    checks: IRefinementCheck[],
    current?: SemanticVersion
) {
    return !refinementBlocker(inquiries, checks, current);
}
