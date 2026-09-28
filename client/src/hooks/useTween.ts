import { useEffect, useRef, useState } from "react";
import { animate, Transition } from "framer-motion";
import { EASE_STANDARD } from "../constants";
import { useReducedMotion } from "./useReducedMotion";

const DEFAULT_TRANSITION = { duration: 0.6, ease: EASE_STANDARD } as const;

type TweenOptions<T> = {
    lerp: (from: T, to: T, progress: number) => T;
    /** Whether two targets are the same, so a caller building a fresh one each render doesn't retrigger */
    isSame?: (a: T, b: T) => boolean;
    transition?: Transition;
};

/** Eases towards each new target from wherever it's currently drawn, so a retarget mid-tween carries on rather
 *  than jumping back. `previous` is the target being left, for anything which should fade with the tween. */
export function useTween<T>(
    nextTarget: T,
    { lerp, isSame = Object.is, transition = DEFAULT_TRANSITION }: TweenOptions<T>
) {
    const prefersReducedMotion = useReducedMotion();
    // Held until it genuinely changes - a fresh-but-equal target every render would otherwise re-run the
    // effect below on each frame of its own tween, whose cleanup stops the animation it has just started
    const stableTargetRef = useRef(nextTarget);
    if (!isSame(stableTargetRef.current, nextTarget)) {
        stableTargetRef.current = nextTarget;
    }
    const target = stableTargetRef.current;
    const [tween, setTween] = useState({ from: target, to: target, previous: target, progress: 1 });
    const shown = tween.progress >= 1 ? tween.to : lerp(tween.from, tween.to, tween.progress);

    const shownRef = useRef(shown);
    shownRef.current = shown;
    const targetRef = useRef(target);

    useEffect(() => {
        const previous = targetRef.current;
        if (isSame(previous, target)) {
            // A cleanup can stop a tween part-way without a new target (eg. reduced motion toggled mid-run)
            setTween((current) => (current.progress < 1 ? { ...current, progress: 1 } : current));
            return;
        }
        targetRef.current = target;
        if (prefersReducedMotion) {
            setTween({ from: target, to: target, previous: target, progress: 1 });
            return;
        }
        setTween({ from: shownRef.current, to: target, previous, progress: 0 });
        const controls = animate(0, 1, {
            ...transition,
            onUpdate: (progress) => setTween((current) => ({ ...current, progress }))
        });
        return () => controls.stop();
    }, [target, prefersReducedMotion, isSame, transition]);

    return { shown, previous: tween.previous, progress: tween.progress };
}

const sameValues = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);

const lerpValues = (from: readonly number[], to: readonly number[], progress: number) =>
    to.map((value, index) => {
        const start = from[index] ?? value;
        return start + (value - start) * progress;
    });

export function useTweenedNumbers(target: readonly number[]) {
    return useTween(target, { lerp: lerpValues, isSame: sameValues }).shown;
}
