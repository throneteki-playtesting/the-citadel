import { Fragment, useEffect, useRef } from "react";
import { Card, CardBody } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { StatusStep, stepperColorClasses } from "../constants";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { BaseElementProps, UIColor } from "../types";
import { TouchTooltip } from "./touchTooltip";

// How long one segment takes to fill, and equally how long the node after it waits to light up
const STEP_DURATION = 450;
// How long a node takes to take on (or lose) its lane's colour, once its turn in the sweep arrives
const NODE_DURATION = 200;
// An index before the first step - an empty track, which is what an unloaded stepper draws
const EMPTY_INDEX = -1;

const sizeClasses = {
    sm: {
        node: "size-6 sm:size-7",
        icon: "text-[.7rem] sm:text-sm",
        connector: "h-1 sm:h-1.5"
    },
    md: {
        node: "size-8 sm:size-9",
        icon: "text-sm sm:text-base",
        connector: "h-1.5 sm:h-2"
    }
};

// Staggers the track so a multi-status jump sweeps through the steps in between rather than moving
// at once - each segment waits out the ones before it, and emptying runs the same way in reverse
function sweepDelay(index: number, from: number, to: number, isNode: boolean, duration: number): number {
    if (to > from) {
        if (index <= from || index > to) {
            return 0;
        }
        return (index - from - (isNode ? 0 : 1)) * duration;
    }
    if (to < from) {
        if (index <= to || index > from) {
            return 0;
        }
        return (from - index) * duration;
    }
    return 0;
}

// Progression track: a progress bar whose segment boundaries are the lane's status icons. Steps up
// to and including currentIndex take the lane's colour; everything beyond it stays neutral.
export default function StatusStepper({
    className,
    style,
    steps,
    currentIndex,
    committedIndex,
    color = "primary",
    size = "sm",
    isDisabled = false,
    isLoading = false,
    onStepPress
}: StatusStepperProps) {
    const sizes = sizeClasses[size];
    const colors = stepperColorClasses[color];
    const prefersReducedMotion = useReducedMotion();

    // Loading holds the last status drawn rather than showing a placeholder, so a refresh sweeps
    // across to the new status instead of dropping back to the start and climbing out again
    const loadedIndexRef = useRef(isLoading ? EMPTY_INDEX : currentIndex);
    if (!isLoading) {
        loadedIndexRef.current = currentIndex;
    }
    const displayIndex = loadedIndexRef.current;

    // Where the track sat before this render, so the sweep staggers from there rather than the start
    const previousIndexRef = useRef(displayIndex);
    const previousIndex = previousIndexRef.current;
    useEffect(() => {
        previousIndexRef.current = displayIndex;
    }, [displayIndex]);

    const stepDuration = prefersReducedMotion ? 0 : STEP_DURATION;
    const nodeDuration = prefersReducedMotion ? 0 : NODE_DURATION;

    return (
        <div
            className={classNames("flex items-center transition-opacity", isDisabled && "opacity-50", className)}
            style={style}
        >
            {steps.map((step, index) => {
                const isReached = index <= displayIndex;
                const isStepDisabled = isDisabled || !!step.isDisabled;
                const isPressable = !!onStepPress && !isStepDisabled;
                const nodeClass = classNames(
                    // transition-all so the ring (a box-shadow) fades with the rest; the opaque fill hides the bar behind it
                    "relative z-10 shrink-0 flex items-center justify-center rounded-full border-2 bg-content1 transition-all",
                    sizes.node,
                    isReached ? colors.node : "border-default-200 text-foreground/40",
                    index === displayIndex && classNames("ring-4", colors.ring),
                    index === committedIndex && index !== displayIndex && classNames("ring-2", colors.ringFaint),
                    isPressable && "cursor-pointer hover:scale-110",
                    // The root already dims a wholly-disabled track, so only an individually locked step dims itself
                    !isPressable && (isStepDisabled ? "cursor-not-allowed" : "cursor-help"),
                    !isPressable && step.isDisabled && !isDisabled && "opacity-60"
                );
                const nodeStyle = {
                    transitionDuration: `${nodeDuration}ms`,
                    transitionDelay: `${sweepDelay(index, previousIndex, displayIndex, true, stepDuration)}ms`
                };
                const icon = <FontAwesomeIcon icon={step.icon} className={sizes.icon} />;
                // HeroUI positions against the trigger's own box, so the node itself must be the tooltip trigger
                const node = isPressable ? (
                    <button
                        type="button"
                        aria-label={step.label}
                        className={nodeClass}
                        style={nodeStyle}
                        onClick={() => onStepPress(step.key)}
                    >
                        {icon}
                    </button>
                ) : (
                    <div className={nodeClass} style={nodeStyle}>
                        {icon}
                    </div>
                );

                return (
                    <Fragment key={step.key}>
                        {index > 0 && (
                            // Square-ended and tucked under the nodes either side, so the bar reads as running behind them
                            <div
                                className={classNames(
                                    "relative flex-1 min-w-1 -mx-0.5 bg-default-200 overflow-hidden",
                                    sizes.connector
                                )}
                            >
                                <div
                                    className={classNames(
                                        "absolute inset-0 origin-left transition-transform ease-linear",
                                        colors.fill,
                                        isReached ? "scale-x-100" : "scale-x-0"
                                    )}
                                    style={{
                                        transitionDuration: `${stepDuration}ms`,
                                        transitionDelay: `${sweepDelay(index, previousIndex, displayIndex, false, stepDuration)}ms`
                                    }}
                                />
                            </div>
                        )}
                        {isPressable ? node : <TouchTooltip content={<StepTooltip step={step} />}>{node}</TouchTooltip>}
                    </Fragment>
                );
            })}
        </div>
    );
}

function StepTooltip({ step }: { step: StepperStep }) {
    return (
        <div className="max-w-60 px-1 py-1 space-y-1">
            <div className="font-cinzel uppercase tracking-wide text-xs">{step.label}</div>
            <div className="font-sans normal-case text-xs text-foreground/70 leading-snug">{step.description}</div>
            {step.disabledReason && (
                <div className="font-sans normal-case text-xs text-warning leading-snug">{step.disabledReason}</div>
            )}
        </div>
    );
}

// Steps are stacked in one grid cell and cross-faded, so the block holds the height of the longest
// description and nothing below it shifts as the selection moves
export function StatusStepDetail({ className, style, steps, selectedKey }: StatusStepDetailProps) {
    return (
        <div className={classNames("grid", className)} style={style}>
            {steps.map((step) => (
                <div
                    key={step.key}
                    className={classNames(
                        "col-start-1 row-start-1 transition-opacity duration-300",
                        step.key === selectedKey ? "opacity-100" : "opacity-0 pointer-events-none"
                    )}
                    aria-hidden={step.key !== selectedKey}
                >
                    <Card shadow="none" className="bg-default-100 h-full">
                        <CardBody className="gap-1 py-3">
                            <div className="flex items-center gap-2 font-cinzel uppercase tracking-wide text-sm">
                                <FontAwesomeIcon icon={step.icon} className="text-foreground/60" />
                                {step.label}
                            </div>
                            <div className="text-xs sm:text-sm text-foreground/60 leading-snug">{step.description}</div>
                        </CardBody>
                    </Card>
                </div>
            ))}
        </div>
    );
}

/** A lane's configured step, plus whatever the screen rendering it knows about pickability */
export type StepperStep = StatusStep & {
    isDisabled?: boolean;
    /** Why the step can't be picked; shown under its description in the tooltip */
    disabledReason?: string;
};

type StatusStepperProps = Omit<BaseElementProps, "children"> & {
    steps: StepperStep[];
    /** Index into `steps` the track is filled to; it and everything before it are coloured */
    currentIndex: number;
    /** A second, faintly ringed marker - the saved status, while a different one is being previewed */
    committedIndex?: number;
    color?: UIColor;
    size?: keyof typeof sizeClasses;
    /** Greys the whole track out and makes every step unpickable, regardless of `onStepPress` */
    isDisabled?: boolean;
    /** Holds the track where it is - empty on first load - until the status is available again */
    isLoading?: boolean;
    /** Makes the nodes pickable; omit for a read-only track */
    onStepPress?: (key: string) => void;
};

type StatusStepDetailProps = Omit<BaseElementProps, "children"> & {
    steps: StepperStep[];
    selectedKey: string;
};
