import { useState } from "react";
import { Button, Divider } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCircleInfo, faPencil } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import Permission from "common/models/permissions";
import { ICardProgress } from "common/progress/calc";
import { useGetCardProgressQuery } from "../../api";
import { usePermission } from "../../hooks/usePermission";
import { BaseElementProps } from "../../types";
import { TouchTooltip } from "../../components/touchTooltip";
import StatusStepper from "../../components/statusStepper";
import TooltipDetail from "../../components/tooltipDetail";
import { useCountUp } from "../../hooks/useCountUp";
import useHistoryState from "../../hooks/useHistoryState";
import {
    artworkLane,
    CardLaneKey,
    cardLanes,
    designLane,
    laneSteps,
    productionLane,
    StatusStep,
    statusNodeClass,
    stepperSizeClasses
} from "../../constants";
import type { CardTab } from "./cardDetail";
import DesignProgressModal from "./designProgressModal";
import ArtworkStatusModal from "./artwork/artworkStatusModal";
import ProductionProgressModal from "./productionProgressModal";

const lanes = Object.keys(cardLanes) as CardLaneKey[];

// Flattened per lane, since each lane's statuses are a different union and can't be walked generically
const laneTracks: Record<CardLaneKey, StatusStep[]> = {
    design: laneSteps(designLane),
    artwork: laneSteps(artworkLane),
    production: laneSteps(productionLane)
};

function laneStepIndex(lane: CardLaneKey, statuses?: ICardProgress["statuses"]): number {
    return statuses ? laneTracks[lane].findIndex((step) => step.key === statuses[lane]) : -1;
}

function laneStep(lane: CardLaneKey, statuses?: ICardProgress["statuses"]): StatusStep | undefined {
    const index = laneStepIndex(lane, statuses);
    return index >= 0 ? laneTracks[lane][index] : undefined;
}

export default function CardProgress({ className, style, project, number }: CardProgressProps) {
    const { data, isLoading } = useGetCardProgressQuery({ project, number });
    const [openLane, setOpenLane] = useState<CardLaneKey | null>(null);
    // Artwork outgrew a modal - its lane opens the card's Artwork tab instead, sharing the tab's own state
    const [, setTab] = useHistoryState<CardTab>("tab", "development");
    // Mobile only - from sm up the lanes are always on show, whatever this holds
    const [isExpanded, setIsExpanded] = useState(false);

    const canEdit = usePermission(Permission.EDIT_SLOTS);
    const canEditArtworks = usePermission(Permission.EDIT_ARTWORKS);
    const canApprove = usePermission(Permission.APPROVE_CARD_DESIGN);
    const canOpen: Record<CardLaneKey, boolean> = {
        design: canEdit || canApprove,
        artwork: canEditArtworks,
        production: canEdit
    };

    return (
        <>
            <div className={classNames("flex flex-col sm:flex-row sm:items-center p-2", className)} style={style}>
                <ProgressSummary
                    overall={data?.overall}
                    statuses={data?.statuses}
                    isExpanded={isExpanded}
                    onToggle={() => setIsExpanded((previous) => !previous)}
                />
                <OverallValue value={data?.overall} />
                <div
                    className={classNames(
                        "pt-2 flex-1 min-w-0 grid transition-[grid-template-rows] duration-300 ease-in-out sm:grid-rows-[1fr]",
                        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}
                >
                    <div className="overflow-hidden sm:overflow-visible">
                        <div className="flex flex-col gap-2 sm:gap-3 p-1 sm:p-0">
                            {lanes.map((lane) => (
                                <LaneStepper
                                    key={lane}
                                    lane={lane}
                                    statuses={data?.statuses}
                                    isLoading={isLoading || !data}
                                    isOpenable={canOpen[lane]}
                                    onPress={() => setOpenLane(lane)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <DesignProgressModal
                isOpen={openLane === "design"}
                onClose={() => setOpenLane(null)}
                project={project}
                number={number}
            />
            <ArtworkStatusModal
                isOpen={openLane === "artwork"}
                onClose={() => setOpenLane(null)}
                onOpenArtwork={() => {
                    setOpenLane(null);
                    setTab("artwork");
                }}
                project={project}
                number={number}
            />
            <ProductionProgressModal
                isOpen={openLane === "production"}
                onClose={() => setOpenLane(null)}
                project={project}
                number={number}
            />
        </>
    );
}

// Heading, track and edit button share a row, keeping each lane one line tall. The track itself is
// inert - its nodes carry their own tooltips - so editing is the pencil alone.
function LaneStepper({ lane, statuses, isLoading, isOpenable, onPress }: LaneStepperProps) {
    const config = cardLanes[lane];
    const steps = laneTracks[lane];
    const currentIndex = laneStepIndex(lane, statuses);

    return (
        <div className="w-full flex flex-col sm:flex-row sm:gap-2">
            <div className="shrink-0 w-18 sm:w-28 flex items-center">
                <span className="flex-1 font-cinzel uppercase tracking-wide text-foreground/60 text-[.65rem] sm:text-xs">
                    {config.heading}
                </span>
                {isOpenable && (
                    <TouchTooltip content={`Edit ${config.heading}`}>
                        <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            radius="full"
                            className="shrink-0 size-6 min-w-6 text-foreground/40"
                            onPress={onPress}
                        >
                            <FontAwesomeIcon icon={faPencil} className="text-[.65rem] sm:text-xs" />
                        </Button>
                    </TouchTooltip>
                )}
            </div>
            <StatusStepper
                steps={steps}
                currentIndex={currentIndex}
                isLoading={isLoading}
                color={config.color}
                className="flex-1 min-w-0"
            />
        </div>
    );
}

type LaneStepperProps = {
    lane: CardLaneKey;
    statuses?: ICardProgress["statuses"];
    isLoading: boolean;
    isOpenable: boolean;
    onPress: () => void;
};

// The whole of the progress section on mobile until it's opened: the one number, and where each lane
// has got to. Tapping a badge shows that lane's status instead of toggling, since the tooltip
// swallows the press.
function ProgressSummary({ overall, statuses, isExpanded, onToggle }: ProgressSummaryProps) {
    return (
        <button
            type="button"
            aria-expanded={isExpanded}
            aria-label="Card progress"
            className="sm:hidden w-full flex items-center gap-2 py-1"
            onClick={onToggle}
        >
            <div className="flex-1 flex items-center justify-center gap-1">
                <PercentValue value={overall} className="text-3xl" />
                <OverallInfoTooltip />
            </div>
            <Divider orientation="vertical" className="h-8" />
            <div className="relative flex-3 min-w-0">
                <div
                    className={classNames(
                        "grid grid-cols-3 place-items-center transition-opacity",
                        isExpanded ? "opacity-0 pointer-events-none duration-150" : "opacity-100 duration-300 delay-500"
                    )}
                >
                    {lanes.map((lane) => (
                        <LaneBadge key={lane} lane={lane} statuses={statuses} />
                    ))}
                </div>
                <div
                    className={classNames(
                        "absolute inset-0 flex items-center pointer-events-none transition-[clip-path] duration-500 ease-in-out",
                        isExpanded ? "[clip-path:inset(0_0_0_0)]" : "[clip-path:inset(0_100%_0_0)]"
                    )}
                    aria-hidden={!isExpanded}
                >
                    <span className="pl-1 whitespace-nowrap font-cinzel uppercase tracking-wide text-foreground/50 text-sm">
                        Overall Progress
                    </span>
                </div>
            </div>
            <FontAwesomeIcon
                icon={faChevronDown}
                className={classNames(
                    "text-foreground/40 text-sm transition-transform duration-300",
                    isExpanded && "rotate-180"
                )}
            />
        </button>
    );
}

type ProgressSummaryProps = {
    overall?: number;
    statuses?: ICardProgress["statuses"];
    isExpanded: boolean;
    onToggle: () => void;
};

// Owns the count-up so only the number re-renders per frame, rather than everything around it
function PercentValue({ className, style, value }: PercentValueProps) {
    const displayValue = useCountUp(value);

    return (
        <span className={classNames("font-sans text-foreground leading-none tabular-nums", className)} style={style}>
            {Math.round(displayValue)}%
        </span>
    );
}

type PercentValueProps = Omit<BaseElementProps, "children"> & { value?: number };

// A lane boiled down to one node, borrowing the stepper's own node so the two read as the same set
function LaneBadge({ lane, statuses }: LaneBadgeProps) {
    const config = cardLanes[lane];
    const step = laneStep(lane, statuses);

    return (
        <TouchTooltip
            content={
                <TooltipDetail heading={step ? `${config.heading} - ${step.label}` : config.heading}>
                    {step?.description}
                </TooltipDetail>
            }
        >
            <div className={classNames(statusNodeClass(!!step, config.color, "lg"), "cursor-help transition-colors")}>
                {step && <FontAwesomeIcon icon={step.icon} className={stepperSizeClasses.lg.icon} />}
            </div>
        </TouchTooltip>
    );
}

type LaneBadgeProps = {
    lane: CardLaneKey;
    statuses?: ICardProgress["statuses"];
};

function OverallInfoTooltip() {
    return (
        <TouchTooltip
            content={
                <div className="max-w-56 text-xs">
                    The overall percentage is calculated from this card's Design, Artwork and Production completeness.
                </div>
            }
        >
            <FontAwesomeIcon icon={faCircleInfo} className="text-foreground/40 text-sm cursor-help" />
        </TouchTooltip>
    );
}

const overallValueClass = "text-5xl sm:text-6xl";

function OverallValue({ value }: { value?: number }) {
    return (
        <div className="hidden sm:flex flex-col items-center mx-auto">
            <div className="flex items-center gap-1.5">
                <div className="grid">
                    <div
                        className={classNames(
                            "col-start-1 row-start-1 invisible font-sans leading-none tabular-nums",
                            overallValueClass
                        )}
                        aria-hidden
                    >
                        100%
                    </div>
                    <PercentValue
                        value={value}
                        className={classNames("col-start-1 row-start-1 text-end", overallValueClass)}
                    />
                </div>
                <OverallInfoTooltip />
            </div>
            <div className="text-base sm:text-xs font-cinzel uppercase tracking-wide text-foreground/50">
                Overall Progress
            </div>
        </div>
    );
}

type CardProgressProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
};
