import { SCROLL_PATIENCE_MS, SCROLL_STILL_FRAMES } from "../../../constants";

// Brings a slot into view if any of it is out of view - down the page and along its carousel, each only as far as it
// needs - resolving once it has stopped moving. A slot already wholly on show is left exactly where it is
export function scrollToSlot(pile: HTMLElement | undefined) {
    return new Promise<void>((resolve) => {
        const scroller = pile?.closest("[data-carousel-scroller]");
        if (!pile || !scroller) {
            resolve();
            return;
        }
        const slot = pile.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        const isAcross = slot.left < view.left || slot.right > view.right;
        const isDown = slot.top < 0 || slot.bottom > window.innerHeight;
        if (!isAcross && !isDown) {
            resolve();
            return;
        }
        if (isAcross) {
            scroller.scrollBy({
                left: slot.left + slot.width / 2 - (view.left + view.width / 2),
                behavior: "smooth"
            });
        }
        if (isDown) {
            window.scrollBy({ top: slot.top + slot.height / 2 - window.innerHeight / 2, behavior: "smooth" });
        }
        // The scroll is over once the slot has held still for a few frames
        const started = performance.now();
        let still = 0;
        let last = slot;
        const watch = () => {
            const now = pile.getBoundingClientRect();
            still = now.left === last.left && now.top === last.top ? still + 1 : 0;
            last = now;
            if (still >= SCROLL_STILL_FRAMES || performance.now() - started > SCROLL_PATIENCE_MS) {
                resolve();
            } else {
                requestAnimationFrame(watch);
            }
        };
        requestAnimationFrame(watch);
    });
}
