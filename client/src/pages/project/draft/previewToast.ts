import { useEffect, useRef, useState } from "react";
import { ISlot } from "common/models/slots";
import { showLiveToast } from "../../../components/liveToast/liveToast";
import { LiveToastProgress } from "../../../components/liveToast/liveToastState";
import { LIVE_TOAST_STALLED_MS } from "../../../constants";
import { useSlotSync } from "../../../hooks/useSync";
import { RevealAction } from "./revealState";

const wording: Record<RevealAction, { working: string; done: string }> = {
    reveal: { working: "Revealing card", done: "Card revealed" },
    update: { working: "Updating preview", done: "Preview updated" },
    replace: { working: "Replacing reveal", done: "Reveal replaced" },
    withdraw: { working: "Withdrawing preview", done: "Preview withdrawn" }
};

type SlotRef = Pick<ISlot, "project" | "number">;
type PreviewProgress = LiveToastProgress & { reason?: string };

// A finish only counts once the slot's state has changed since opening - it may still hold how the last run ended
function usePreviewProgress(slot: SlotRef): PreviewProgress {
    const sync = useSlotSync(slot).preview;
    const opened = useRef(sync);
    const [isStalled, setIsStalled] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsStalled(true), LIVE_TOAST_STALLED_MS);
        return () => clearTimeout(timer);
    }, []);

    const hasRun = sync !== opened.current || sync.status === "start" || sync.status === "progress";
    if (hasRun && sync.status === "complete") {
        return { status: "success" };
    }
    if (hasRun && sync.status === "error") {
        return { status: "danger", reason: sync.error };
    }
    return isStalled ? { status: "danger", reason: "Discord did not respond" } : { status: "working" };
}

// One toast for the length of a reveal change
export function showPreviewToast(slot: SlotRef, action: RevealAction) {
    showLiveToast({
        useProgress: () => usePreviewProgress(slot),
        title: ({ status }) =>
            status === "danger"
                ? "Failed to update the reveal"
                : wording[action][status === "success" ? "done" : "working"],
        description: ({ status, reason }) =>
            status === "danger"
                ? (reason ?? "The card forum may be missing or out of reach.")
                : status === "success"
                  ? `Slot #${slot.number} is up to date`
                  : `Slot #${slot.number} - the card forum is being updated`
    });
}
