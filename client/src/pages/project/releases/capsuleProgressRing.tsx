import { ReactNode } from "react";
import classNames from "classnames";

// Drawn on a 24-unit viewBox, so the ring's geometry is fixed regardless of the icon it surrounds
const RADIUS = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Wraps the capsule's card-type icon in a completeness ring, centring the icon absolutely so that
// surrounding it never changes its rendered size
export default function CapsuleProgressRing({ value, ringClassName, children }: CapsuleProgressRingProps) {
    return (
        <span className="relative shrink-0 size-6 flex items-center justify-center">
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

type CapsuleProgressRingProps = {
    value: number;
    /** Applied to the ring alone, so it can be styled without touching the icon it surrounds */
    ringClassName?: string;
    children: ReactNode;
};
