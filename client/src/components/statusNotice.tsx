import { ReactNode } from "react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { BaseElementProps } from "../types";

const toneClasses = {
    neutral: "border-content3 bg-content2/40 text-foreground/70",
    info: "border-primary/30 bg-primary/5 text-primary",
    warning: "border-warning/40 bg-warning/5 text-warning",
    danger: "border-danger/40 bg-danger/5 text-danger",
    success: "border-success/40 bg-success/5 text-success"
} as const;

/**
 * A single line stating where something stands. Deliberately not a HeroUI Alert - an alert announces a
 * problem and takes the room to match, where these are the steady state of a record and sit above it all
 * the time. A thin left rule and one line of text carry the same meaning without shouting it.
 */
export default function StatusNotice({
    icon,
    label,
    detail,
    tone = "neutral",
    className,
    children
}: StatusNoticeProps) {
    return (
        <div
            className={classNames(
                "flex items-center gap-2.5 rounded-md border border-l-4 py-1.5 px-2.5 text-xs",
                toneClasses[tone],
                className
            )}
        >
            {icon && <FontAwesomeIcon icon={icon} className="shrink-0 text-lg" />}
            <div className="min-w-0 flex-1 flex flex-col sm:gap-2">
                <span className="font-cinzel uppercase tracking-wide whitespace-nowrap text-sm">{label}</span>
                {detail && <div className="min-w-0 text-foreground/60">{detail}</div>}
            </div>
            {children}
        </div>
    );
}

export type StatusNoticeTone = keyof typeof toneClasses;

type StatusNoticeProps = Omit<BaseElementProps, "style"> & {
    icon?: IconDefinition;
    label: string;
    detail?: ReactNode;
    tone?: StatusNoticeTone;
};
