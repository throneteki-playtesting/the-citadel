import classNames from "classnames";
import { Faction } from "common/models/cards";
import { ChangeType } from "common/types";
import * as discordEmojis from "discord-emoji";
import { IPlaytestReview, StatementAnswer } from "common/models/reviews";
import { ReleaseStatus } from "common/models/projects";
import {
    ArtworkStatus,
    ArtworkType,
    DesignStatus,
    designStatuses,
    artworkStatuses,
    productionStatuses,
    ProductionStatus
} from "common/models/slots";
import { ArtworkContactState, ArtworkPrepFlag } from "common/models/artwork";
import { InquirySeverity, InquiryStatus } from "common/models/refinement";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { UIColor } from "./types";
import {
    faCheck,
    faCircleDot,
    faCircleExclamation,
    faEye,
    faFeather,
    faHammer,
    faHourglassStart,
    faImages,
    faLayerGroup,
    faLightbulb,
    faLock,
    faMagnifyingGlass,
    faPaintbrush,
    faPalette,
    faTriangleExclamation,
    faWandMagicSparkles
} from "@fortawesome/free-solid-svg-icons";
import { faCircleCheck, faCircleQuestion, faCircleXmark } from "@fortawesome/free-regular-svg-icons";

// The one easing curve panels/rows settle with, so every fade/slide in the app moves the same way
export const EASE_STANDARD = [0.65, 0, 0.35, 1] as const;

// How every reordering list in the app settles, so a row moving reads the same wherever it is watched
export const reorderTransition = { duration: 0.4, ease: EASE_STANDARD } as const;

// Shared by every user picker, so the anonymous placeholder user never shows up as a pickable option
export const EXCLUDE_ANONYMOUS_USER_FILTER = { discordId: { $ne: "anonymous" } };

// A ring marking an avatar's selection or verdict, offset clear of whatever it sits on
export const avatarRingClasses = "ring-2 ring-offset-2 ring-offset-background";

// Overrides the shift the Avatar theme's inGroup variant applies, which uses data-[hover]/data-[focus-visible]
export const stackedAvatarClasses =
    "transition-none data-[hover=true]:!translate-x-0 rtl:data-[hover=true]:!translate-x-0 data-[focus-visible=true]:!translate-x-0 rtl:data-[focus-visible=true]:!translate-x-0";

// Round bubble standing in for an avatar - the "add your check" button and the +N overflow
export const avatarBubbleClasses =
    "shrink-0 size-10 rounded-full bg-content2 border border-content3 text-foreground/60 flex items-center justify-center cursor-pointer transition-all hover:scale-105";

export const stepperSizeClasses = {
    sm: {
        node: "size-6 sm:size-7",
        icon: "text-[.7rem] sm:text-sm",
        connector: "h-1 sm:h-1.5"
    },
    md: {
        node: "size-8 sm:size-9",
        icon: "text-sm sm:text-base",
        connector: "h-1.5 sm:h-2"
    },
    lg: {
        node: "size-9",
        icon: "text-sm",
        connector: "h-2"
    }
};

export type StepperSize = keyof typeof stepperSizeClasses;

export function statusNodeClass(isReached: boolean, color: UIColor, size: StepperSize) {
    return classNames(
        "shrink-0 flex items-center justify-center rounded-full border-2 bg-content1",
        stepperSizeClasses[size].node,
        isReached ? stepperColorClasses[color].node : "border-default-200 text-foreground/40"
    );
}

// Tailwind needs literal class names, so each colour's shades are enumerated rather than interpolated
export const stepperColorClasses: Record<UIColor, { node: string; fill: string; ring: string; ringFaint: string }> = {
    default: {
        node: "border-default-400 text-default-500",
        fill: "bg-default-400",
        ring: "ring-default-400/50",
        ringFaint: "ring-default-400/25"
    },
    primary: {
        node: "border-primary text-primary",
        fill: "bg-primary",
        ring: "ring-primary/50",
        ringFaint: "ring-primary/25"
    },
    secondary: {
        node: "border-secondary text-secondary",
        fill: "bg-secondary",
        ring: "ring-secondary/50",
        ringFaint: "ring-secondary/25"
    },
    success: {
        node: "border-success text-success",
        fill: "bg-success",
        ring: "ring-success/50",
        ringFaint: "ring-success/25"
    },
    warning: {
        node: "border-warning text-warning",
        fill: "bg-warning",
        ring: "ring-warning/50",
        ringFaint: "ring-warning/25"
    },
    danger: {
        node: "border-danger text-danger",
        fill: "bg-danger",
        ring: "ring-danger/50",
        ringFaint: "ring-danger/25"
    }
};

export const textUIColor: Record<UIColor, string> = {
    default: "text-default-500",
    primary: "text-primary",
    secondary: "text-secondary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger"
};

export const factionBorderClasses: Record<Faction, string> = {
    baratheon: "border-baratheon-300",
    greyjoy: "border-greyjoy-300",
    lannister: "border-lannister-300",
    martell: "border-martell-300",
    thenightswatch: "border-thenightswatch-300",
    stark: "border-stark-300",
    targaryen: "border-targaryen-300",
    tyrell: "border-tyrell-300",
    neutral: "border-neutral-300"
};

export const factionBgClasses: Record<Faction, string> = {
    baratheon: "bg-baratheon-50/90",
    greyjoy: "bg-greyjoy-50/90",
    lannister: "bg-lannister-50/90",
    martell: "bg-martell-50/90",
    thenightswatch: "bg-thenightswatch-50/90",
    stark: "bg-stark-50/90",
    targaryen: "bg-targaryen-50/90",
    tyrell: "bg-tyrell-50/90",
    neutral: "bg-neutral-50/90"
};

// Full strength, for a stripe or rule which is the only thing carrying the faction - the faded border and
// background variants above are washes sat behind other content, and vanish at a few pixels wide
export const factionAccentClasses: Record<Faction, string> = {
    baratheon: "bg-baratheon",
    greyjoy: "bg-greyjoy",
    lannister: "bg-lannister",
    martell: "bg-martell",
    thenightswatch: "bg-thenightswatch",
    stark: "bg-stark",
    targaryen: "bg-targaryen",
    tyrell: "bg-tyrell",
    neutral: "bg-neutral"
};

export const watermarkClasses: Record<string, string> = {
    baratheon: "text-baratheon-300",
    greyjoy: "text-greyjoy-300",
    lannister: "text-lannister-300",
    martell: "text-martell-300",
    thenightswatch: "text-thenightswatch-300",
    stark: "text-stark-300",
    targaryen: "text-targaryen-300",
    tyrell: "text-tyrell-300",
    neutral: "text-neutral-300"
};

export const factionBarClasses: Record<Faction, string> = {
    baratheon: "bg-baratheon-300",
    greyjoy: "bg-greyjoy-300",
    lannister: "bg-lannister-300",
    martell: "bg-martell-300",
    thenightswatch: "bg-thenightswatch-300",
    stark: "bg-stark-300",
    targaryen: "bg-targaryen-300",
    tyrell: "bg-tyrell-300",
    neutral: "bg-neutral-300"
};

export const releaseStatusColors: Record<ReleaseStatus, "default" | "warning" | "secondary" | "primary" | "success"> = {
    planning: "default",
    confirming: "warning",
    approved: "secondary",
    released: "success"
};

export const releaseStatusDescriptions: Record<ReleaseStatus, string> = {
    planning: "Cards are still being chosen for this release",
    confirming: "Cards are unlikely to change, and their final details are being polished",
    approved:
        "Contents & final card details are locked in; the print sheet is being assembled and proofed by the design team",
    released: "Officially released to the public for physical & digital play"
};

// Everything the UI knows about a card's status lanes - headings, tooltip copy, icons and colour.
// Adding a status means an entry in common/models/slots plus one in the matching `meta` below.
export type CardLaneKey = "design" | "artwork" | "production";

export type StatusMeta = {
    label: string;
    description: string;
    icon: IconDefinition;
};

export type CardLane<S extends string> = {
    /** Heading shown beside the lane's track */
    heading: string;
    /** The single colour every reached status is drawn in, so the lanes read as one set */
    color: UIColor;
    /** Progression order - the track and every status picker render in this order */
    statuses: readonly S[];
    meta: Record<S, StatusMeta>;
};

export const designLane: CardLane<DesignStatus> = {
    heading: "Design",
    color: "primary",
    statuses: designStatuses,
    meta: {
        preview: {
            label: "Preview",
            description: "Pre-release version of card has been revealed, and initial feedback is being gathered",
            icon: faEye
        },
        forging: {
            label: "Forging",
            description: "Version 1.0.0 has begun - design and testing loop on this card until it is deemed ready",
            icon: faHammer
        },
        refinement: {
            label: "Refinement",
            description:
                "Design is locked in; the wording & refinements team finalises the card and catches anything missed",
            icon: faFeather
        },
        complete: {
            label: "Complete",
            description: "The card's design has been confirmed and is done",
            icon: faCheck
        }
    }
};

export const artworkLane: CardLane<ArtworkStatus> = {
    heading: "Artwork",
    color: "primary",
    statuses: artworkStatuses,
    meta: {
        pending: {
            label: "Pending",
            description: "Artwork for this card has not been started yet",
            icon: faHourglassStart
        },
        acquiring: {
            label: "Acquiring",
            description: "Artwork is being obtained - whether sourced, commissioned, or AI-generated",
            icon: faPalette
        },
        confirming: {
            label: "Confirming",
            description: "The finished artwork is being checked over",
            icon: faMagnifyingGlass
        },
        complete: {
            label: "Complete",
            description: "The card's artwork has been finalised",
            icon: faCheck
        }
    }
};

export const productionLane: CardLane<ProductionStatus> = {
    heading: "Production",
    color: "primary",
    statuses: productionStatuses,
    meta: {
        waiting: {
            label: "Waiting",
            description: "Production can only start once design and artwork are both complete",
            icon: faLock
        },
        compositing: {
            label: "Compositing",
            description: "The artwork and final wording are being assembled into the card file",
            icon: faLayerGroup
        },
        complete: {
            label: "Complete",
            description: "The card file exists and is finished",
            icon: faCheck
        }
    }
};

export const cardLanes = { design: designLane, artwork: artworkLane, production: productionLane };

/** One status of a lane, flattened into what StatusStepper renders, in progression order */
export type StatusStep = StatusMeta & { key: string };

export function laneSteps<S extends string>(lane: CardLane<S>): StatusStep[] {
    return lane.statuses.map((status) => ({ key: status, ...lane.meta[status] }));
}

export const artworkTypeNames: Record<ArtworkType, string> = {
    sourced: "Sourced",
    commissioned: "Commissioned",
    ai: "AI Generated"
};

export const artworkTypeDescriptions: Record<ArtworkType, string> = {
    sourced: "Existing art found online, with permission arranged",
    commissioned: "An artist is creating original art for this card",
    ai: "Art generated using AI tools"
};

export const artworkTypeIcons: Record<ArtworkType, IconDefinition> = {
    sourced: faImages,
    commissioned: faPaintbrush,
    ai: faWandMagicSparkles
};

// How far an approach to an artist has got. Ordered, since the picker walks it left to right
export const artworkContactMeta: Record<ArtworkContactState, { label: string; description: string; color: UIColor }> = {
    none: {
        label: "Not Contacted",
        description: "Nobody has approached the artist about using this piece yet",
        color: "default"
    },
    contacted: {
        label: "Contacted",
        description: "The artist has been asked, but has not replied yet",
        color: "default"
    },
    responded: {
        label: "Responded",
        description: "The artist replied, but has not given a yes or no yet",
        color: "primary"
    },
    granted: { label: "Granted", description: "The artist has allowed this piece to be used", color: "success" },
    implied: {
        label: "Implied",
        description:
            "The artist was contacted but never responded - work is going ahead anyway, since this is existing FFG artwork",
        color: "success"
    },
    denied: { label: "Denied", description: "The artist has refused this piece", color: "danger" }
};

export const artworkPrepMeta: Record<ArtworkPrepFlag, { label: string; description: string }> = {
    upscaling: { label: "Upscaling", description: "The resolution is too low to print as is" },
    outpainting: { label: "Out-painting", description: "The image needs canvas added to fill the card frame" },
    cropping: {
        label: "Cropping",
        description: "The composition needs reframing around the title and text boxes"
    },
    cleanup: { label: "Cleanup", description: "Artefacts, watermarks or anatomy need tidying up" },
    colour: { label: "Colour Correction", description: "Contrast and palette need matching to its release" },
    attribution: { label: "Attribution", description: "The artist wants a specific credit recorded" }
};

// FFG owning a piece never grants permission on its own, so the wording stays a prompt to judge, not a pass
export const FFG_ARTWORK_DESCRIPTION =
    "Existing artwork from a previous edition, owned by FFG. Recorded so the manager can weigh up how much permission matters here - it does not count as permission by itself.";

export const changeTypeClasses: Record<ChangeType, string> = {
    new: "border-success-300 bg-success-100 text-success-700",
    draft: "border-secondary-300 bg-secondary-100 text-secondary-700",
    preview: "border-secondary-300 bg-secondary-100 text-secondary-700",
    updated: "border-secondary-300 bg-secondary-100 text-secondary-700",
    reworked: "border-warning-300 bg-warning-100 text-warning-700",
    replaced: "border-danger-300 bg-danger-100 text-danger-700",
    refinement: "border-primary-300 bg-primary-100 text-primary-700"
};

export const dismoji: { [emoji: string]: string } = {};

for (const categoryName in discordEmojis) {
    const categoryEmojis = (discordEmojis as { [category: string]: { [emoji: string]: string } })[categoryName];
    if (typeof categoryEmojis == "object" && categoryEmojis !== null && !Array.isArray(categoryEmojis)) {
        Object.assign(dismoji, categoryEmojis);
    }
}

export const emojis = {
    playtesting: "dart",
    physicalplaytesting: "flower_playing_cards",
    digitalplaytesting: "computer",
    changeLog: "memo",
    changeNotes: "card_file_box",
    implemented: "white_check_mark",
    notimplemented: "no_entry_sign",
    replaced: "twisted_rightwards_arrows",
    reworked: "arrows_clockwise",
    updated: "arrow_double_up",
    refinement: "pencil2",
    bugfixed: "wrench",
    other: "eight_spoked_asterisk"
} as { [emoji: string]: string };

export type InquirySeverityMeta = {
    label: string;
    /** What this severity is for, shown under its name in the picker */
    description: string;
    /** A concrete case, so the boundary between two neighbouring severities is settled by illustration */
    example: string;
    icon: IconDefinition;
    color: UIColor;
    /** Chip and dot colouring, matching how changeTypeClasses draws a card's change note */
    classes: string;
    /** The icon alone, where there is no chip around it to carry the colour */
    iconClass: string;
    /** A light wash behind the inquiry's own title - the severity read at a glance, without a chip saying it */
    titleClass: string;
};

// One scale, read top to bottom as increasing seriousness - the first two assert nothing is wrong yet,
// raised only so a research task or open decision isn't forgotten
export const inquirySeverityMeta: Record<InquirySeverity, InquirySeverityMeta> = {
    unchecked: {
        label: "Unchecked",
        description:
            "Needs investigating before we can say whether there is a problem at all. Raise it so it is not forgotten, then set the severity once you have looked.",
        example: "Checking The Last Greenseer against every plot in the pool for unexpected interactions.",
        icon: faMagnifyingGlass,
        color: "default",
        classes: "border-default-300 bg-default-100 text-default-700",
        iconClass: "text-default-500",
        titleClass: "bg-default-100"
    },
    needsConfirmation: {
        label: "Needs Confirmation",
        description:
            "No problem as such - a decision that needs making, where either option would work and we need to settle on one.",
        example: 'Deciding whether an ability reads "each player chooses" or "each player must choose".',
        icon: faCircleQuestion,
        color: "secondary",
        classes: "border-secondary-300 bg-secondary-100 text-secondary-700",
        iconClass: "text-secondary",
        titleClass: "bg-secondary-100/60"
    },
    recommendation: {
        label: "Recommendation",
        description: "The card works as intended, but there is a change worth considering that would improve it.",
        example: "Adding a trait for consistency with similar cards in the faction.",
        icon: faLightbulb,
        color: "primary",
        classes: "border-primary-300 bg-primary-100 text-primary-700",
        iconClass: "text-primary",
        titleClass: "bg-primary-100/60"
    },
    minorProblem: {
        label: "Minor Problem",
        description:
            "Genuinely wrong, but it does not stop the card working or being understood. Should be fixed before release.",
        example: "Templating that does not match official wording, or traits listed in the wrong order.",
        icon: faTriangleExclamation,
        color: "warning",
        classes: "border-warning-300 bg-warning-100 text-warning-700",
        iconClass: "text-warning",
        titleClass: "bg-warning-100/60"
    },
    majorProblem: {
        label: "Major Problem",
        description: "Must be resolved before release - broken, unclear, or carrying consequences we cannot accept.",
        example: "An ability that loops infinitely, or wording that leaves a key timing question unanswerable.",
        icon: faCircleExclamation,
        color: "danger",
        classes: "border-danger-300 bg-danger-100 text-danger-700",
        iconClass: "text-danger",
        titleClass: "bg-danger-100/60"
    }
};

export const inquiryStatusMeta: Record<InquiryStatus, { label: string; icon: IconDefinition; color: UIColor }> = {
    open: { label: "Open", icon: faCircleDot, color: "primary" },
    resolved: { label: "Resolved", icon: faCircleCheck, color: "success" },
    rejected: { label: "Rejected", icon: faCircleXmark, color: "default" }
};

export const highlightTarget = {
    review: (review: IPlaytestReview) =>
        `review-${review.project}|${review.number}|${review.version}|${review.reviewer}`,
    factionCarousel: (project: number, faction: Faction) => `faction-${project}|${faction}`,
    release: (project: number, code: string) => `release-${project}|${code}`,
    playtestingUpdateCard: (project: number, number: number) => `update-card-${project}|${number}`,
    inquiry: (project: number, number: number, inquiry: number) => `inquiry-${project}|${number}|${inquiry}`
} as const;

export const statementOptions: {
    value: StatementAnswer;
    color: "danger" | "warning" | "default" | "secondary" | "success";
}[] = [
    { value: "strongly disagree", color: "danger" },
    { value: "somewhat disagree", color: "warning" },
    { value: "neither agree nor disagree", color: "default" },
    { value: "somewhat agree", color: "secondary" },
    { value: "strongly agree", color: "success" }
];
