import { useLayoutEffect, useRef } from "react";
import { CollisionDetection, DropAnimation } from "@dnd-kit/core";
import { animate } from "framer-motion";
import { CHIP_DROP_MS, NOTICE_TRANSITION } from "../../constants";
import { SlotGroup } from "./slotGroups";

export const NEW_GROUP_DROP_ID = "new-group";
export const groupDropId = (id: number) => `group-${id}`;

// Read live rather than from dnd-kit's measurements - the new group zone opening mid-drag moves every
// group under the pointer, and a rect taken at pickup would then point at the row beside it
export const underPointer: CollisionDetection = ({ droppableContainers, pointerCoordinates }) => {
    if (!pointerCoordinates) {
        return [];
    }
    const { x, y } = pointerCoordinates;
    const hit = droppableContainers.find((container) => {
        const rect = container.node.current?.getBoundingClientRect();
        return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
    return hit ? [{ id: hit.id }] : [];
};

// Homes in on the chip's place as it stands each frame - rows are still opening and closing around it,
// and a flight aimed at where it sat on release lands beside it
export const homingDrop: DropAnimation = ({ active, dragOverlay, transform }) =>
    new Promise<void>((resolve) => {
        const from = dragOverlay.rect;
        const started = performance.now();
        active.node.style.opacity = "0";
        const step = (now: number) => {
            const progress = Math.min((now - started) / CHIP_DROP_MS, 1);
            const eased = 1 - (1 - progress) ** 3;
            const to = active.node.getBoundingClientRect();
            const x = transform.x + (to.left - from.left) * eased;
            const y = transform.y + (to.top - from.top) * eased;
            dragOverlay.node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            if (progress < 1) {
                requestAnimationFrame(step);
                return;
            }
            active.node.style.opacity = "";
            resolve();
        };
        requestAnimationFrame(step);
    });

// A group is placed on the page, a faction within its group - or a faction would slide twice, once with its row
function placeOf(piece: Element) {
    const rect = piece.getBoundingClientRect();
    const row = piece.matches("[data-faction]") ? piece.closest("[data-group]")?.getBoundingClientRect() : undefined;
    return { x: rect.left - (row?.left ?? 0), y: rect.top - (row?.top ?? 0) };
}

// A regrouping reorders groups and the factions in them, so each slides from where it sat rather than jumping.
// Places are taken at the drop, since the new group zone has moved every group since pickup
export function useRegroupSlide(groups: SlotGroup[], onChange: (groups: SlotGroup[]) => void) {
    const list = useRef<HTMLUListElement>(null);
    const placesAtDrop = useRef<Map<Element, ReturnType<typeof placeOf>>>(undefined);
    const regroup = (next: SlotGroup[]) => {
        const pieces = Array.from(list.current?.querySelectorAll("[data-group], [data-faction]") ?? []);
        placesAtDrop.current = new Map(pieces.map((piece) => [piece, placeOf(piece)]));
        onChange(next);
    };
    useLayoutEffect(() => {
        const before = placesAtDrop.current;
        placesAtDrop.current = undefined;
        for (const [piece, was] of before ?? []) {
            const now = placeOf(piece);
            const x = was.x - now.x;
            const y = was.y - now.y;
            if (piece instanceof HTMLElement && piece.isConnected && (x || y)) {
                // Held at the old place now - the animation's first frame comes a paint too late
                piece.style.transform = `translate(${x}px, ${y}px)`;
                animate(piece, { x: [x, 0], y: [y, 0] }, NOTICE_TRANSITION);
            }
        }
    }, [groups]);
    return { list, regroup };
}
