import { useLayoutEffect } from "react";
import { useReducedMotion } from "./useReducedMotion";

const GLIDE_ID = "glide";

type Place = { left: number; top: number };

// How far an element is drawn from its place, part-way through a glide
function offsetOf(element: HTMLElement): Place {
    const [left, top] = getComputedStyle(element).translate.split(" ").map(parseFloat);
    return { left: left || 0, top: top || 0 };
}

// Eases a container's children from where they were to wherever layout moves them, except when the container resizes
export function useGlidingChildren(container: HTMLElement | null, timing: KeyframeAnimationOptions) {
    const prefersReducedMotion = useReducedMotion();
    useLayoutEffect(() => {
        if (!container || prefersReducedMotion) {
            return;
        }
        let places = new Map<HTMLElement, Place>();
        let width = container.clientWidth;
        const settle = () => {
            const isResized = container.clientWidth !== width;
            width = container.clientWidth;
            const next = new Map<HTMLElement, Place>();
            for (const child of Array.from(container.children) as HTMLElement[]) {
                const place = { left: child.offsetLeft, top: child.offsetTop };
                const last = places.get(child);
                next.set(child, place);
                if (!last || isResized || (last.left === place.left && last.top === place.top)) {
                    continue;
                }
                // Moved again mid-glide, it carries on from wherever it has got to
                const from = offsetOf(child);
                child
                    .getAnimations()
                    .filter((animation) => animation.id === GLIDE_ID)
                    .forEach((animation) => animation.cancel());
                const glide = child.animate(
                    [
                        { translate: `${from.left + last.left - place.left}px ${from.top + last.top - place.top}px` },
                        { translate: "0px 0px" }
                    ],
                    timing
                );
                glide.id = GLIDE_ID;
            }
            places = next;
        };
        const sizes = new ResizeObserver(settle);
        sizes.observe(container);
        Array.from(container.children).forEach((child) => sizes.observe(child));
        // A child added or removed moves the rest without any of them resizing
        const members = new MutationObserver((records) => {
            for (const record of records) {
                record.addedNodes.forEach((node) => node instanceof Element && sizes.observe(node));
                record.removedNodes.forEach((node) => node instanceof Element && sizes.unobserve(node));
            }
            settle();
        });
        members.observe(container, { childList: true });
        return () => {
            sizes.disconnect();
            members.disconnect();
        };
    }, [container, timing, prefersReducedMotion]);
}
