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
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { UIColor } from "./types";
import {
    faCircleCheck,
    faEye,
    faFeather,
    faHammer,
    faHourglassStart,
    faLayerGroup,
    faLock,
    faMagnifyingGlass,
    faPalette
} from "@fortawesome/free-solid-svg-icons";

// A ring marking an avatar's selection or verdict, offset clear of whatever it sits on
export const avatarRingClasses = "ring-2 ring-offset-2 ring-offset-background";

// Round bubble standing in for an avatar - the "add your check" button and the +N overflow
export const avatarBubbleClasses =
    "shrink-0 size-10 rounded-full bg-content2 border border-content3 text-foreground/60 flex items-center justify-center cursor-pointer transition-all hover:scale-105";

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

export const factionBorderClasses: Record<Faction, string> = {
    baratheon: "border-baratheon/30",
    greyjoy: "border-greyjoy/30",
    lannister: "border-lannister/30",
    martell: "border-martell/30",
    thenightswatch: "border-thenightswatch/30",
    stark: "border-stark/20",
    targaryen: "border-targaryen",
    tyrell: "border-tyrell/30",
    neutral: "border-neutral/30"
};

export const factionBgClasses: Record<Faction, string> = {
    baratheon: "bg-baratheon/10",
    greyjoy: "bg-greyjoy/10",
    lannister: "bg-lannister/10",
    martell: "bg-martell/10",
    thenightswatch: "bg-thenightswatch/10",
    stark: "bg-stark/10",
    targaryen: "bg-targaryen/10",
    tyrell: "bg-tyrell/10",
    neutral: "bg-neutral/10"
};

export const watermarkClasses: Record<string, string> = {
    baratheon: "text-baratheon opacity-30",
    greyjoy: "text-greyjoy opacity-30",
    lannister: "text-lannister opacity-30",
    martell: "text-martell opacity-30",
    thenightswatch: "text-thenightswatch opacity-30",
    stark: "text-stark opacity-20",
    targaryen: "text-targaryen brightness-200",
    tyrell: "text-tyrell opacity-30",
    neutral: "text-neutral opacity-30"
};

export const factionBarClasses: Record<Faction, string> = {
    baratheon: "bg-baratheon/50",
    greyjoy: "bg-greyjoy/50",
    lannister: "bg-lannister/50",
    martell: "bg-martell/50",
    thenightswatch: "bg-thenightswatch/50",
    stark: "bg-stark/50",
    targaryen: "bg-targaryen/50",
    tyrell: "bg-tyrell/50",
    neutral: "bg-neutral/50"
};

export const releaseStatusColors: Record<ReleaseStatus, "default" | "warning" | "secondary" | "primary" | "success"> = {
    planning: "default",
    confirming: "warning",
    approved: "secondary",
    assembling: "primary",
    proofing: "primary",
    released: "success"
};

export const releaseStatusDescriptions: Record<ReleaseStatus, string> = {
    planning: "Cards are still being chosen for this release",
    confirming: "Cards are unlikely to change, and their final details are being polished",
    approved: "Contents & final card details are locked in; the print sheet has not yet been assembled",
    assembling: "The final print sheet is being produced from the release's completed cards",
    proofing: "The print sheet is being reviewed by the team for mistakes before release",
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
            icon: faCircleCheck
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
            icon: faCircleCheck
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
            icon: faCircleCheck
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

export const changeTypeClasses: Record<ChangeType, string> = {
    new: "border-success-300 bg-success-100 text-success-700",
    draft: "border-secondary-300 bg-secondary-100 text-secondary-700",
    preview: "border-secondary-300 bg-secondary-100 text-secondary-700",
    updated: "border-secondary-300 bg-secondary-100 text-secondary-700",
    reworked: "border-warning-300 bg-warning-100 text-warning-700",
    replaced: "border-danger-300 bg-danger-100 text-danger-700",
    wording: "border-primary-300 bg-primary-100 text-primary-700"
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
    wording: "pencil2",
    bugfixed: "wrench",
    other: "eight_spoked_asterisk"
} as { [emoji: string]: string };

export const highlightTarget = {
    review: (review: IPlaytestReview) =>
        `review-${review.project}|${review.number}|${review.version}|${review.reviewer}`,
    factionCarousel: (project: number, faction: Faction) => `faction-${project}|${faction}`,
    release: (project: number, code: string) => `release-${project}|${code}`
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
