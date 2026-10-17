import { CollisionDetection, DroppableContainer } from "@dnd-kit/core";
import type { Coordinates } from "@dnd-kit/utilities";
import { MIN_VISIBLE_SLOT } from "../../../constants";

// Read from where each target is now - dnd-kit measures them once, as a drag begins, so a target scrolled into view
// since is never found
const underPointer = ({ pointerCoordinates, droppableContainers }: Parameters<CollisionDetection>[0]) => {
    if (!pointerCoordinates) {
        return [];
    }
    return droppableContainers
        .flatMap((container) => {
            const rect = container.node.current?.getBoundingClientRect();
            const isUnder =
                rect &&
                pointerCoordinates.x >= rect.left &&
                pointerCoordinates.x <= rect.right &&
                pointerCoordinates.y >= rect.top &&
                pointerCoordinates.y <= rect.bottom;
            const distance = rect
                ? Math.hypot(
                      pointerCoordinates.x - (rect.left + rect.width / 2),
                      pointerCoordinates.y - (rect.top + rect.height / 2)
                  )
                : 0;
            return isUnder ? [{ id: container.id, data: { droppableContainer: container, value: distance } }] : [];
        })
        .sort((a, b) => a.data.value - b.data.value);
};

const isPoolTarget = (id: string | number) => String(id).startsWith("pool-");
const isSlotTarget = (id: string | number) => String(id).startsWith("slot-");

// Whether a slot is on show in its carousel, and the pointer is on the part of it which is
function isSlotShown(container: DroppableContainer, pointer: Coordinates) {
    const node = container.node.current;
    const scroller = node?.closest("[data-carousel-scroller]");
    if (!node || !scroller) {
        return true;
    }
    const slot = node.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const width = Math.min(slot.right, view.right) - Math.max(slot.left, view.left);
    return (
        width >= slot.width * MIN_VISIBLE_SLOT &&
        pointer.x >= Math.max(slot.left, view.left) &&
        pointer.x <= Math.min(slot.right, view.right) &&
        pointer.y >= Math.max(slot.top, view.top) &&
        pointer.y <= Math.min(slot.bottom, view.bottom)
    );
}

// The pointer decides, not how much of a slot-sized card overlaps what. Most particular wins: the pool, a slot on show,
// then the faction around it
export const collisions: CollisionDetection = (args) => {
    const { pointerCoordinates, droppableContainers } = args;
    const pointed = underPointer(args);
    const pool = pointed.filter(({ id }) => isPoolTarget(id));
    if (pool.length > 0) {
        return pool;
    }
    const slots = pointed.filter(
        ({ id }) =>
            isSlotTarget(id) &&
            pointerCoordinates &&
            isSlotShown(droppableContainers.find((container) => container.id === id)!, pointerCoordinates)
    );
    return slots.length > 0 ? slots : pointed.filter(({ id }) => !isSlotTarget(id));
};
