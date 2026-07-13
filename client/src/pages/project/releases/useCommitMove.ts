import { addToast } from "@heroui/react";
import { useDispatch } from "react-redux";
import { useAssignSlotReleaseMutation } from "../../../api";
import api from "../../../api";
import type { AppDispatch } from "../../../api/store";

// Persists a resolved {code, position} (or eviction to the pool); the server resolves any occupant swap/eviction itself
export function useCommitMove(projectNumber: number, captureFlip: (excludeSlotNumber?: number) => void) {
    const [assignSlotRelease] = useAssignSlotReleaseMutation();
    const dispatch = useDispatch<AppDispatch>();

    return async (slotNumber: number, code: string | null, position?: number) => {
        const payload = code === null
            ? { project: projectNumber, number: slotNumber, code: null as null }
            : { project: projectNumber, number: slotNumber, code, position: position! };

        // Snapshot capsule positions so any occupant displaced by this move animates to its new
        // home; the dragged capsule is excluded as its flight is the DragOverlay drop animation
        captureFlip(slotNumber);
        const patchResult = dispatch(
            api.util.updateQueryData("getSlots", { project: projectNumber }, (draft) => {
                const dragged = draft.items.find((s) => s.number === slotNumber);
                if (!dragged) {
                    return;
                }
                const previousRelease = dragged.release;
                if (payload.code === null) {
                    delete dragged.release;
                } else {
                    const occupant = draft.items.find((s) => s.release?.code === payload.code && s.release?.position === payload.position && s.number !== slotNumber);
                    if (occupant) {
                        if (previousRelease) {
                            occupant.release = previousRelease;
                        } else {
                            delete occupant.release;
                        }
                    }
                    dragged.release = { code: payload.code, position: payload.position };
                }
            })
        );

        try {
            await assignSlotRelease(payload).unwrap();
        } catch {
            // No exclusion here - the drag is long over, so the dragged capsule should animate back too
            captureFlip();
            patchResult.undo();
            addToast({ title: "Failed to move card", color: "danger", description: "The card could not be moved" });
        }
    };
}
