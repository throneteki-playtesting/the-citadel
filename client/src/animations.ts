import { DropAnimation } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

const SETTLE_FRAMES = 3;
const SETTLE_LIMIT_MS = 1000;

// Resolves once a node's box has held still for a few frames, or after a limit so a drop is never held for good
async function settled(node: HTMLElement) {
    const start = performance.now();
    let last = node.getBoundingClientRect();
    let still = 0;
    while (still < SETTLE_FRAMES && performance.now() - start < SETTLE_LIMIT_MS) {
        await new Promise(requestAnimationFrame);
        const box = node.getBoundingClientRect();
        const isStill =
            box.left === last.left && box.top === last.top && box.width === last.width && box.height === last.height;
        still = isStill ? still + 1 : 0;
        last = box;
    }
}

// A drop animation for a dnd-kit DragOverlay item whose displayed shape can rotate 90 degrees between its
// drag preview and its destination (eg. a landscape card that lands rotated into a portrait slot). Whether
// to rotate is inferred purely from the two rects' shapes, so callers don't need to track orientation themselves.
export const rotatingDropAnimation: DropAnimation = async ({ active, dragOverlay, transform }) => {
    // Held where it was let go until its destination has stopped moving - a slot still turning or resizing under it
    // would otherwise be flown to mid-change, and the card stretched and turned to fit a shape it is leaving
    active.node.style.setProperty("opacity", "0");
    await settled(active.node);
    const target = active.node.getBoundingClientRect();
    const overlayIsLandscape = dragOverlay.rect.width > dragOverlay.rect.height;
    const activeIsLandscape = target.width > target.height;
    const rotate = overlayIsLandscape !== activeIsLandscape;

    // transform-origin defaults to the box's center, so scale/rotate pivot there regardless of amount -
    // aligning centers (rather than dnd-kit's default top-left corners) stays correct even when the
    // shape changes drastically, as it does here
    const overlayCenter = {
        x: dragOverlay.rect.left + dragOverlay.rect.width / 2,
        y: dragOverlay.rect.top + dragOverlay.rect.height / 2
    };
    const activeCenter = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
    // Rotating swaps which of the overlay's axes lines up with which of the destination's axes
    const scaleX = rotate
        ? target.height / dragOverlay.rect.width
        : transform.scaleX !== 1
          ? (target.width * transform.scaleX) / dragOverlay.rect.width
          : 1;
    const scaleY = rotate
        ? target.width / dragOverlay.rect.height
        : transform.scaleY !== 1
          ? (target.height * transform.scaleY) / dragOverlay.rect.height
          : 1;
    const finalTransform = {
        x: transform.x + (activeCenter.x - overlayCenter.x),
        y: transform.y + (activeCenter.y - overlayCenter.y),
        scaleX,
        scaleY
    };

    const initialKeyframe = { transform: CSS.Transform.toString(transform) ?? "" };
    const finalKeyframe = {
        transform: `${CSS.Transform.toString(finalTransform) ?? ""}${rotate ? " rotate(-90deg)" : ""}`
    };
    if (JSON.stringify(initialKeyframe) === JSON.stringify(finalKeyframe)) {
        active.node.style.removeProperty("opacity");
        return;
    }

    const animation = dragOverlay.node.animate([initialKeyframe, finalKeyframe], {
        duration: 250,
        easing: "ease",
        fill: "forwards"
    });
    return new Promise<void>((resolve) => {
        animation.onfinish = () => {
            active.node.style.removeProperty("opacity");
            resolve();
        };
    });
};
