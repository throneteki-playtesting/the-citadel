import { useEffect, useState } from "react";
import { animate, Easing, useMotionValue, useMotionValueEvent } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";

const DURATION = 1.5;
// Fast out of the gate, decelerating hard into the target
const EASE: Easing | Easing[] = "circOut";

// Counts up to `target`, starting from 0 only when the figure wasn't known at mount - so cached
// figures start where they belong, and a retarget animates on rather than snapping back to 0
export function useCountUp(target: number | undefined) {
    const prefersReducedMotion = useReducedMotion();
    // Deliberately only the first render's argument, which is what decides where this mount starts
    const motionValue = useMotionValue(target ?? 0);
    // Mirrored into state, since callers need the number itself for rendering and non-motion props
    const [value, setValue] = useState(target ?? 0);

    useMotionValueEvent(motionValue, "change", setValue);

    useEffect(() => {
        // Nothing to count towards yet; hold where we are until the figure arrives
        if (target === undefined) {
            return;
        }
        const controls = animate(motionValue, target, {
            duration: prefersReducedMotion ? 0 : DURATION,
            ease: EASE
        });
        return () => controls.stop();
    }, [target, prefersReducedMotion, motionValue]);

    return value;
}
