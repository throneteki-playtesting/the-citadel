import { CollisionDetection, defaultDropAnimationSideEffects, DropAnimation, pointerWithin, rectIntersection } from "@dnd-kit/core";
import { SortingStrategy } from "@dnd-kit/sortable";
import { IProjectRelease } from "common/models/projects";
import { ISlot } from "common/models/slots";

export const POOL_ID = "pool";
export const HOVER_EXPAND_DELAY = 200;
export const noReorderPreview: SortingStrategy = () => null;

export const cardItemId = (slotNumber: number) => `card-${slotNumber}`;
export const emptyItemId = (code: string, position: number) => `empty-${code}-${position}`;
export const slotNumberFromItemId = (id: string) => id.startsWith("card-") ? Number(id.slice(5)) : undefined;
export const reorderItemId = (code: string) => `reorder-${code}`;
export const codeFromReorderItemId = (id: string) => id.startsWith("reorder-") ? id.slice(8) : undefined;

export const findContainer = (containers: Record<string, string[]>, id: string): string | undefined => {
    if (id in containers) {
        return id;
    }
    return Object.keys(containers).find((key) => containers[key].includes(id));
};

// Hide the real node until the overlay's drop flight lands, so there's never a double image
export const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } })
};

// Pointer containment beats closestCenter between unevenly-sized zones. Reorder and capsule drags
// share one DndContext, so each only collides with its own kind of droppable
export const collisionDetection: CollisionDetection = (args) => {
    const isReorderDrag = codeFromReorderItemId(String(args.active.id)) !== undefined;
    const droppableContainers = args.droppableContainers.filter(
        (container) => (codeFromReorderItemId(String(container.id)) !== undefined) === isReorderDrag
    );
    const pointerCollisions = pointerWithin({ ...args, droppableContainers });
    return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection({ ...args, droppableContainers });
};

export function buildContainers(pool: ISlot[], releases: IProjectRelease[], slots: ISlot[]): Record<string, string[]> {
    const containers: Record<string, string[]> = {
        [POOL_ID]: pool.map((slot) => cardItemId(slot.number))
    };
    for (const release of releases) {
        const bySlotPosition = new Map(
            slots.filter((slot) => slot.release?.code === release.code).map((slot) => [slot.release!.position, slot])
        );
        containers[release.code] = Array.from({ length: release.capacity }, (_, i) => {
            const position = i + 1;
            const slot = bySlotPosition.get(position);
            return slot ? cardItemId(slot.number) : emptyItemId(release.code, position);
        });
    }
    return containers;
}

// Live-previews only pool arrivals; every other hover is purely visual (see isDragging/isOver in
// ReleasePositionSlot/PoolCapsule) and confirmed on drop (handleDragEnd), where any displaced
// occupant animates to its new home via useCapsuleFlip
export function withHover(base: Record<string, string[]>, activeId: string, overId: string): Record<string, string[]> {
    const trueContainer = Object.keys(base).find((key) => base[key].includes(activeId));
    if (!trueContainer) {
        return base;
    }

    const overContainer = findContainer(base, overId);
    if (!overContainer) {
        return base;
    }

    if (overContainer === POOL_ID && trueContainer !== POOL_ID) {
        const trueIndex = base[trueContainer].indexOf(activeId);
        // The pool is unordered - reinsert by slot number so the card lands at its home position
        const number = slotNumberFromItemId(activeId)!;
        const poolItems = base[POOL_ID].slice();
        const insertIndex = poolItems.findIndex((itemId) => slotNumberFromItemId(itemId)! > number);
        poolItems.splice(insertIndex === -1 ? poolItems.length : insertIndex, 0, activeId);
        const activeItems = base[trueContainer].slice();
        activeItems[trueIndex] = emptyItemId(trueContainer, trueIndex + 1);
        return { ...base, [trueContainer]: activeItems, [POOL_ID]: poolItems };
    }

    return base;
}
