import { ReactNode } from "react";
import { Progress } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faEye } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { TouchTooltip } from "./touchTooltip";
import { useCountUp } from "../hooks/useCountUp";
import { BaseElementProps, UIColor } from "../types";

const sizeClasses = {
    sm: {
        label: "text-[.6rem] sm:text-xs",
        value: "text-[.6rem] sm:text-xs",
        bar: "sm" as const
    },
    lg: {
        label: "text-xs sm:text-sm",
        value: "text-lg sm:text-2xl",
        bar: "md" as const
    }
};

// The inline layout always uses a md bar, regardless of the text size
const INLINE_BAR_WIDTH = "w-32 sm:w-48";

// Labelled horizontal progress bar - shared by the card lanes, release headers and project header
export default function ProgressMeter({
    className,
    style,
    label,
    value,
    color = "primary",
    size = "sm",
    info,
    layout = "stacked",
    isOpenable = false,
    onPress
}: ProgressMeterProps) {
    const sizes = sizeClasses[size];
    // Bar and figure share the count-up, and the bar's own easing is disabled so it doesn't lag it.
    // An unloaded meter is the real thing at 0%, which then counts up once the figure lands.
    const displayValue = useCountUp(value);

    const infoIcon = info && (
        <TouchTooltip content={<div className="max-w-56 text-xs normal-case">{info}</div>}>
            <FontAwesomeIcon icon={faCircleInfo} className="text-foreground/40 cursor-help" />
        </TouchTooltip>
    );

    // Drops the label so the bar can sit within a row of chips
    if (layout === "inline") {
        return (
            <div className={classNames("flex items-center gap-1.5", className)} style={style}>
                <Progress
                    aria-label={typeof label === "string" ? label : "Progress"}
                    value={displayValue}
                    color={color}
                    size="md"
                    className={INLINE_BAR_WIDTH}
                    disableAnimation
                />
                <span className={classNames("font-sans text-foreground/70 leading-none tabular-nums", sizes.value)}>
                    {Math.round(displayValue)}%
                </span>
                <span className="text-xs">{infoIcon}</span>
            </div>
        );
    }

    const content = (
        <>
            <div className="flex items-center justify-between gap-2">
                <span
                    className={classNames(
                        "flex items-center gap-1.5 font-cinzel uppercase tracking-wide text-foreground/60",
                        sizes.label
                    )}
                >
                    {label}
                    {isOpenable && <FontAwesomeIcon icon={faEye} className="text-foreground/40" />}
                    {infoIcon}
                </span>
                <span className={classNames("font-sans text-foreground leading-none tabular-nums", sizes.value)}>
                    {Math.round(displayValue)}%
                </span>
            </div>
            <Progress
                aria-label={typeof label === "string" ? label : "Progress"}
                value={displayValue}
                color={color}
                size={sizes.bar}
                disableAnimation
            />
        </>
    );

    if (!isOpenable) {
        return (
            <div className={classNames("w-full flex flex-col gap-1", className)} style={style}>
                {content}
            </div>
        );
    }

    return (
        <button
            type="button"
            className={classNames(
                "w-full flex flex-col gap-1 cursor-pointer transition-opacity hover:opacity-75",
                className
            )}
            style={style}
            onClick={onPress}
        >
            {content}
        </button>
    );
}

// Stands in for a meter whose figure couldn't be fetched - an explicit fault beats silently vanishing
export function ProgressUnavailable({ className, style, reason, size = "sm" }: ProgressUnavailableProps) {
    return (
        <div
            className={classNames(
                "flex items-center gap-1.5 font-cinzel uppercase tracking-wide text-foreground/40",
                sizeClasses[size].label,
                className
            )}
            style={style}
        >
            Progress unavailable
            <TouchTooltip content={<div className="max-w-56 text-xs normal-case">{reason}</div>}>
                <FontAwesomeIcon icon={faCircleInfo} className="cursor-help" />
            </TouchTooltip>
        </div>
    );
}

type ProgressMeterProps = Omit<BaseElementProps, "children"> & {
    label: ReactNode;
    /** Undefined until the figure has loaded, which holds the meter at 0% */
    value?: number;
    color?: UIColor;
    size?: keyof typeof sizeClasses;
    /** Rendered in a tooltip behind an info icon beside the label */
    info?: ReactNode;
    /** "inline" drops the label and shrinks the bar so it can sit inside an existing row */
    layout?: "stacked" | "inline";
    isOpenable?: boolean;
    onPress?: () => void;
};

type ProgressUnavailableProps = Omit<BaseElementProps, "children"> & {
    reason: string;
    size?: keyof typeof sizeClasses;
};
