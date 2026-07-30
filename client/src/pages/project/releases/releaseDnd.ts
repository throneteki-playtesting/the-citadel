import {
    CollisionDetection,
    defaultDropAnimationSideEffects,
    DropAnimation,
    pointerWithin,
    rectIntersection
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { SortingStrategy } from "@dnd-kit/sortable";
import { Faction } from "common/models/cards";
import { IProjectRelease, ReleaseSlotAllocation } from "common/models/projects";
import { ISlot } from "common/models/slots";
import { getPositionFaction } from "common/utils";

export const POOL_ID = "pool";
// Separate droppable from POOL_ID (mounts/unmounts freely) - normalizeDroppableId folds it back for resolution
export const POOL_MOBILE_TRIGGER_ID = "pool-mobile-trigger";
export const HOVER_EXPAND_DELAY = 200;
const EMPTY_SET: ReadonlySet<string> = new Set();
export const noReorderPreview: SortingStrategy = () => null;

export const cardItemId = (slotNumber: number) => `card-${slotNumber}`;
export const emptyItemId = (code: string, position: number) => `empty-${code}-${position}`;
export const slotNumberFromItemId = (id: string) => (id.startsWith("card-") ? Number(id.slice(5)) : undefined);
export const reorderItemId = (code: string) => `reorder-${code}`;
export const codeFromReorderItemId = (id: string) => (id.startsWith("reorder-") ? id.slice(8) : undefined);
export const normalizeDroppableId = (id: string) => (id === POOL_MOBILE_TRIGGER_ID ? POOL_ID : id);

export const findContainer = (containers: Record<string, string[]>, id: string): string | undefined => {
    if (id in containers) {
        return id;
    }
    return Object.keys(containers).find((key) => containers[key].includes(id));
};

// Positions are faction-locked; an unassigned position or an unknown dragged faction is always compatible
export const isFactionCompatible = (positionFaction: Faction | undefined, cardFaction: Faction | undefined) =>
    !positionFaction || !cardFaction || positionFaction === cardFaction;

// First empty, faction-compatible position in a release - resolves a generic drop and previews its target
export function findNextAvailableIndex(
    itemIds: string[],
    slots: ReleaseSlotAllocation[] | undefined,
    faction: Faction | undefined
): number {
    return itemIds.findIndex(
        (id, index) =>
            slotNumberFromItemId(id) === undefined && isFactionCompatible(getPositionFaction(slots, index + 1), faction)
    );
}

// Hides the real node until the drop flight lands. Used as-is by ExpansionRelease; CycleReleases uses createDropAnimation instead
export const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } })
};

// On a pool drop (isPoolDrop reads a ref set in handleDragEnd), the flight target becomes the pool trigger's center with a shrink+fade
export function createDropAnimation(isPoolDrop: () => boolean): DropAnimation {
    return {
        sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
        keyframes: ({ dragOverlay, transform, droppableContainers }) => {
            if (isPoolDrop()) {
                // Desktop button stays registered but hidden (zero rect) on mobile, and vice versa - use whichever has real size
                const desktopRect = droppableContainers.get(POOL_ID)?.rect.current;
                const mobileRect = droppableContainers.get(POOL_MOBILE_TRIGGER_ID)?.rect.current;
                const poolRect =
                    desktopRect && desktopRect.width > 0 && desktopRect.height > 0 ? desktopRect : mobileRect;
                if (poolRect) {
                    // dragOverlay.rect tracks the live position; active.rect is the pre-drag source spot
                    const dx =
                        poolRect.left + poolRect.width / 2 - (dragOverlay.rect.left + dragOverlay.rect.width / 2);
                    const dy =
                        poolRect.top + poolRect.height / 2 - (dragOverlay.rect.top + dragOverlay.rect.height / 2);
                    const base = CSS.Transform.toString(transform.initial);
                    return [
                        { transform: base, opacity: 1 },
                        { transform: `${base} translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 0 }
                    ];
                }
            }
            return [
                { transform: CSS.Transform.toString(transform.initial) },
                { transform: CSS.Transform.toString(transform.final) }
            ];
        }
    };
}

// Reorder and capsule drags share one DndContext, so each only collides with its own kind of droppable
function poolAwareCollision(
    args: Parameters<CollisionDetection>[0],
    poolState: { isOpen: boolean; poolItemIds: ReadonlySet<string> }
) {
    const isReorderDrag = codeFromReorderItemId(String(args.active.id)) !== undefined;
    let droppableContainers = args.droppableContainers.filter(
        (container) => (codeFromReorderItemId(String(container.id)) !== undefined) === isReorderDrag
    );
    // Collision detection ignores z-index, so a gap between pool chips would otherwise fall through to a release slot behind the panel
    if (poolState.isOpen) {
        droppableContainers = droppableContainers.filter(
            (container) =>
                container.id === POOL_ID ||
                container.id === POOL_MOBILE_TRIGGER_ID ||
                poolState.poolItemIds.has(String(container.id))
        );
    }
    const pointerCollisions = pointerWithin({ ...args, droppableContainers });
    return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection({ ...args, droppableContainers });
}

// ExpansionRelease has no pool, so its pool state is permanently closed
export const collisionDetection: CollisionDetection = (args) =>
    poolAwareCollision(args, { isOpen: false, poolItemIds: EMPTY_SET });

export function createPoolAwareCollisionDetection(
    getPoolState: () => { isOpen: boolean; poolItemIds: ReadonlySet<string> }
): CollisionDetection {
    return (args) => poolAwareCollision(args, getPoolState());
}

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

// Live-previews only pool arrivals; every other hover is purely visual and confirmed on drop (handleDragEnd)
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
