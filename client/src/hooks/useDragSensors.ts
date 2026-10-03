import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { TOUCH_DRAG_DELAY_MS } from "../constants";

// A mouse drag starts after a short move, a touch one after a hold - so a stray touch never picks anything up
export function useDragSensors() {
    return useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: 5 } })
    );
}
