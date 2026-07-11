import { useLayoutEffect, useRef } from "react";

const FLIP_SELECTOR = "[data-flip-slot]";

// FLIP animation for capsules displaced by a drop: call capture() immediately before the state
// change that moves them, and the layout effect measures the post-render arrangement before paint
// and plays an inverted transform from the old position. The move itself is purely cosmetic -
// capsules genuinely render in their final slot straight away.
export function useCapsuleFlip() {
    const pendingRects = useRef<Map<number, DOMRect>>(undefined);

    // excludeSlotNumber skips the actively dragged capsule, whose flight is the DragOverlay drop animation
    const capture = (excludeSlotNumber?: number) => {
        const rects = new Map<number, DOMRect>();
        for (const el of document.querySelectorAll<HTMLElement>(FLIP_SELECTOR)) {
            const slotNumber = Number(el.dataset.flipSlot);
            if (slotNumber !== excludeSlotNumber) {
                rects.set(slotNumber, el.getBoundingClientRect());
            }
        }
        pendingRects.current = rects;
    };

    useLayoutEffect(() => {
        if (!pendingRects.current) {
            return;
        }
        const rects = pendingRects.current;
        pendingRects.current = undefined;
        for (const el of document.querySelectorAll<HTMLElement>(FLIP_SELECTOR)) {
            const from = rects.get(Number(el.dataset.flipSlot));
            if (!from) {
                continue;
            }
            const to = el.getBoundingClientRect();
            const dx = from.left - to.left;
            const dy = from.top - to.top;
            if (!dx && !dy) {
                continue;
            }
            // Keep the travelling capsule above neighbouring cells for the duration of the flight
            el.style.zIndex = "30";
            const animation = el.animate(
                [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
                { duration: 250, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }
            );
            animation.finished.finally(() => {
                el.style.zIndex = "";
            });
        }
    });

    return capture;
}
