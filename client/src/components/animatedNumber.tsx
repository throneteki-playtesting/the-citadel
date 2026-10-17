import { useEffect } from "react";
import { animate, Easing, motion, useMotionValue, useTransform } from "framer-motion";
import { useReducedMotion } from "../hooks/useReducedMotion";

// Matches useCountUp, so a figure counts the same wherever it's drawn
const DURATION = 1.5;
const EASE: Easing | Easing[] = "circOut";

/** A number which counts to each new value without re-rendering (unlike useCountUp), so it's safe beside
 *  layout animations - which turn a per-frame setState into React's "maximum update depth". */
export default function AnimatedNumber({ value, from, className }: AnimatedNumberProps) {
    const prefersReducedMotion = useReducedMotion();
    // Deliberately only the first render's arguments, which is what decides where this mount starts
    const motionValue = useMotionValue(from ?? value);
    const rounded = useTransform(motionValue, (latest) => Math.round(latest).toString());

    useEffect(() => {
        const controls = animate(motionValue, value, {
            duration: prefersReducedMotion ? 0 : DURATION,
            ease: EASE
        });
        return () => controls.stop();
    }, [value, prefersReducedMotion, motionValue]);

    return <motion.span className={className}>{rounded}</motion.span>;
}

type AnimatedNumberProps = {
    value: number;
    // Where the first count starts - omitted, the number simply appears at its value
    from?: number;
    className?: string;
};
