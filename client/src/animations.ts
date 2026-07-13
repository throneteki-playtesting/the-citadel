import { DropAnimation } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// A drop animation for a dnd-kit DragOverlay item whose displayed shape can rotate 90 degrees between its
// drag preview and its destination (eg. a landscape card that lands rotated into a portrait slot). Whether
// to rotate is inferred purely from the two rects' shapes, so callers don't need to track orientation themselves.
export const rotatingDropAnimation: DropAnimation = ({ active, dragOverlay, transform }) => {
    const overlayIsLandscape = dragOverlay.rect.width > dragOverlay.rect.height;
    const activeIsLandscape = active.rect.width > active.rect.height;
    const rotate = overlayIsLandscape !== activeIsLandscape;

    // transform-origin defaults to the box's center, so scale/rotate pivot there regardless of amount -
    // aligning centers (rather than dnd-kit's default top-left corners) stays correct even when the
    // shape changes drastically, as it does here
    const overlayCenter = { x: dragOverlay.rect.left + dragOverlay.rect.width / 2, y: dragOverlay.rect.top + dragOverlay.rect.height / 2 };
    const activeCenter = { x: active.rect.left + active.rect.width / 2, y: active.rect.top + active.rect.height / 2 };
    // Rotating swaps which of the overlay's axes lines up with which of the destination's axes
    const scaleX = rotate
        ? active.rect.height / dragOverlay.rect.width
        : (transform.scaleX !== 1 ? active.rect.width * transform.scaleX / dragOverlay.rect.width : 1);
    const scaleY = rotate
        ? active.rect.width / dragOverlay.rect.height
        : (transform.scaleY !== 1 ? active.rect.height * transform.scaleY / dragOverlay.rect.height : 1);
    const finalTransform = {
        x: transform.x + (activeCenter.x - overlayCenter.x),
        y: transform.y + (activeCenter.y - overlayCenter.y),
        scaleX,
        scaleY
    };

    const initialKeyframe = { transform: CSS.Transform.toString(transform) ?? "" };
    const finalKeyframe = { transform: `${CSS.Transform.toString(finalTransform) ?? ""}${rotate ? " rotate(-90deg)" : ""}` };
    if (JSON.stringify(initialKeyframe) === JSON.stringify(finalKeyframe)) {
        return;
    }

    // Hide the real node until the overlay's flight lands, so there's never a double image
    active.node.style.setProperty("opacity", "0");
    const animation = dragOverlay.node.animate([initialKeyframe, finalKeyframe], { duration: 250, easing: "ease", fill: "forwards" });
    return new Promise<void>((resolve) => {
        animation.onfinish = () => {
            active.node.style.removeProperty("opacity");
            resolve();
        };
    });
};
