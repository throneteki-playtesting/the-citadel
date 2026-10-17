import { ISlot } from "common/models/slots";
import { useSlotSync } from "../../../hooks/useSync";

// Whether a slot's preview is being worked on - how it went is told by the toast the change opened
export function usePreviewSync(slot: Pick<ISlot, "project" | "number">) {
    const { status } = useSlotSync(slot).preview;
    return status === "start" || status === "progress";
}
