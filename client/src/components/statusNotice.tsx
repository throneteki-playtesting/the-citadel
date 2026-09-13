import { ReactNode } from "react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { BaseElementProps } from "../types";

const colorClasses = {
    neutral: "border-content3 bg-content2/40 text-foreground/70",
    info: "border-primary/30 bg-primary/5 text-primary",
    warning: "border-warning/40 bg-warning/5 text-warning",
    danger: "border-danger/40 bg-danger/5 text-danger",
    success: "border-success/40 bg-success/5 text-success"
} as const;

/** A single line stating where something stands - deliberately not a HeroUI Alert, since these are a
 *  record's steady state and sit there permanently, not a one-off event worth shouting about. */
export default function StatusNotice({
    icon,
    iconPosition = "left",
    label,
    detail,
    color = "neutral",
    className,
    children
}: StatusNoticeProps) {
    return (
        <div
            className={classNames(
                "flex flex-col gap-2 rounded-md border border-l-4 py-1.5 px-2.5 text-xs sm:flex-row sm:items-center sm:gap-2.5",
                colorClasses[color],
                className
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {icon && iconPosition === "left" && <FontAwesomeIcon icon={icon} className="shrink-0 text-lg" />}
                <div className="min-w-0 flex-1 flex flex-col sm:gap-2">
                    <span className="flex items-center gap-1.5 font-cinzel uppercase tracking-wide whitespace-nowrap text-sm">
                        {icon && iconPosition === "title" && <FontAwesomeIcon icon={icon} />}
                        {label}
                    </span>
                    {detail && <div className="min-w-0 text-foreground/60">{detail}</div>}
                </div>
            </div>
            {children}
        </div>
    );
}

export type StatusNoticeColor = keyof typeof colorClasses;

type StatusNoticeProps = Omit<BaseElementProps, "style"> & {
    icon?: IconDefinition;
    /** Where `icon` renders - alongside the whole block (default) or inline with the title text.
     *  Only the suggestion checklist opts into "title"; every other caller leaves this unset. */
    iconPosition?: "left" | "title";
    label: string;
    detail?: ReactNode;
    color?: StatusNoticeColor;
};
