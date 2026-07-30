import { useState } from "react";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faPencil } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import Permission from "common/models/permissions";
import { ICardProgress } from "common/progress/calc";
import { useGetCardProgressQuery } from "../../api";
import { usePermission } from "../../hooks/usePermission";
import { BaseElementProps } from "../../types";
import { TouchTooltip } from "../../components/touchTooltip";
import StatusStepper from "../../components/statusStepper";
import { useCountUp } from "../../hooks/useCountUp";
import {
    artworkLane,
    CardLaneKey,
    cardLanes,
    designLane,
    laneSteps,
    productionLane,
    StatusStep
} from "../../constants";
import DesignProgressModal from "./designProgressModal";
import ArtworkProgressModal from "./artworkProgressModal";
import ProductionProgressModal from "./productionProgressModal";

const lanes = Object.keys(cardLanes) as CardLaneKey[];

// Flattened per lane, since each lane's statuses are a different union and can't be walked generically
const laneTracks: Record<CardLaneKey, StatusStep[]> = {
    design: laneSteps(designLane),
    artwork: laneSteps(artworkLane),
    production: laneSteps(productionLane)
};

export default function CardProgress({ className, style, project, number }: CardProgressProps) {
    const { data, isLoading } = useGetCardProgressQuery({ project, number });
    const [openLane, setOpenLane] = useState<CardLaneKey | null>(null);

    const canEdit = usePermission(Permission.EDIT_SLOTS);
    const canApprove = usePermission(Permission.APPROVE_CARD_DESIGN);
    const canOpen: Record<CardLaneKey, boolean> = {
        design: canEdit || canApprove,
        artwork: canEdit,
        production: canEdit
    };

    return (
        <div className={classNames("space-y-2", className)} style={style}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2">
                <OverallValue value={data?.overall} />
                <div className="flex-1 min-w-0 flex flex-col gap-2 sm:gap-3">
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

            <DesignProgressModal
                isOpen={openLane === "design"}
                onClose={() => setOpenLane(null)}
                project={project}
                number={number}
            />
            <ArtworkProgressModal
                isOpen={openLane === "artwork"}
                onClose={() => setOpenLane(null)}
                project={project}
                number={number}
            />
            <ProductionProgressModal
                isOpen={openLane === "production"}
                onClose={() => setOpenLane(null)}
                project={project}
                number={number}
            />
        </div>
    );
}

// Heading, track and edit button share a row, keeping each lane one line tall. The track itself is
// inert - its nodes carry their own tooltips - so editing is the pencil alone.
function LaneStepper({ lane, statuses, isLoading, isOpenable, onPress }: LaneStepperProps) {
    const config = cardLanes[lane];
    const steps = laneTracks[lane];
    const currentIndex = statuses ? steps.findIndex((step) => step.key === statuses[lane]) : -1;

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

const overallValueClass = "text-5xl sm:text-6xl font-sans text-foreground leading-none tabular-nums";

function OverallValue({ value }: { value?: number }) {
    const displayValue = useCountUp(value);

    return (
        <div className="flex flex-row gap-2 items-center sm:flex-col sm:gap-0 mx-auto">
            <div className="flex items-center gap-1.5">
                <div className="grid">
                    <div className={classNames("col-start-1 row-start-1 invisible", overallValueClass)} aria-hidden>
                        100%
                    </div>
                    <div className={classNames("col-start-1 row-start-1 text-end", overallValueClass)}>
                        {Math.round(displayValue)}%
                    </div>
                </div>
                <TouchTooltip
                    content={
                        <div className="max-w-56 text-xs">
                            The overall percentage is calculated from this card's Design, Artwork and Production
                            completeness.
                        </div>
                    }
                >
                    <FontAwesomeIcon icon={faCircleInfo} className="text-foreground/40 text-sm cursor-help" />
                </TouchTooltip>
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
