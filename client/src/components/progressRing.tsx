import { ReactNode } from "react";
import classNames from "classnames";

// Drawn on a 24-unit viewBox, so the ring's geometry is fixed regardless of what it surrounds
const RADIUS = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Wraps content in a completeness ring, centring it absolutely so that surrounding it never changes its rendered size
export default function ProgressRing({ value, className, ringClassName, children }: ProgressRingProps) {
    return (
        <span className={classNames("relative shrink-0 flex items-center justify-center", className ?? "size-6")}>
            <svg
                viewBox="0 0 24 24"
                className={classNames("absolute inset-0 size-full -rotate-90", ringClassName)}
                aria-hidden
            >
                <circle cx="12" cy="12" r={RADIUS} fill="none" strokeWidth="2" className="stroke-foreground/15" />
                <circle
                    cx="12"
                    cy="12"
                    r={RADIUS}
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(Math.max(value, 0), 100) / 100)}
                    className="stroke-primary transition-[stroke-dashoffset] duration-300"
                />
            </svg>
            {children}
        </span>
    );
}

type ProgressRingProps = {
    value: number;
    /** Sizes the ring and the box it centres its children in; defaults to size-6 */
    className?: string;
    /** Applied to the ring alone, so it can be styled without touching what it surrounds */
    ringClassName?: string;
    children: ReactNode;
};
