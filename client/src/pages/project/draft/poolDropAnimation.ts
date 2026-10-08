import { DropAnimationFunction } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { rotatingDropAnimation } from "../../../animations";
import { POOL_DROP_FADE_MS, POOL_DROP_HOLD_LIMIT_MS, POOL_DROP_TAKE_IN_MS } from "../../../constants";
import { DragStore } from "./draftDragStore";

// A card from the pool stays where it was let go until the page has placed it, so the copy which flies from there to
// its slot can take over without a gap - and fades out if nothing took its place
export const poolDropAnimation = (store: DragStore): DropAnimationFunction => {
    return async (args) => {
        const outcome = store.dropOutcome();
        if (!outcome) {
            return rotatingDropAnimation(args);
        }
        store.takeReturning();
        const finish = () => store.clearDrop();
        // Where the card itself is, which is not the box it was picked up from
        const card = args.dragOverlay.node.querySelector("[data-drag-card]") ?? args.dragOverlay.node;
        store.setDropRect(card.getBoundingClientRect());
        // A card from a pile is in the air, so its place in the pile is left empty until it is known where it ends
        const home = args.active.data.current?.suggestion ? undefined : args.active.node;
        home?.style.setProperty("opacity", "0");
        const result = await Promise.race([
            outcome,
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), POOL_DROP_HOLD_LIMIT_MS))
        ]);
        if (result === true) {
            finish();
            return;
        }
        if (result === false) {
            home?.style.removeProperty("opacity");
            await args.dragOverlay.node.animate([{ opacity: 1 }, { opacity: 0 }], {
                duration: POOL_DROP_FADE_MS,
                fill: "forwards"
            }).finished;
            finish();
            return;
        }
        // Taken in by the pool - it shrinks and fades into its middle, wherever the page has scrolled to
        const zone = [...document.querySelectorAll("[data-pool-zone]")]
            .map((element) => element.getBoundingClientRect())
            .find((rect) => rect.width > 0);
        const { left, top, width, height } = args.dragOverlay.node.getBoundingClientRect();
        const dx = zone ? zone.left + zone.width / 2 - (left + width / 2) : 0;
        const dy = zone ? zone.top + zone.height / 2 - (top + height / 2) : 0;
        const { transform } = args;
        await args.dragOverlay.node.animate(
            [
                { transform: CSS.Transform.toString(transform), opacity: 1 },
                {
                    transform: `${CSS.Transform.toString({ ...transform, x: transform.x + dx, y: transform.y + dy })} scale(0.15)`,
                    opacity: 0
                }
            ],
            { duration: POOL_DROP_TAKE_IN_MS, easing: "ease-in", fill: "forwards" }
        ).finished;
        finish();
    };
};
