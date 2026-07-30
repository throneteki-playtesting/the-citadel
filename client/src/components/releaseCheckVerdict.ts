import { faCheck, faX } from "@fortawesome/free-solid-svg-icons";
import { IReleaseCheck, isCheckStale } from "common/models/slots";
import { SemanticVersion } from "common/utils";

// Shared so a verdict reads identically in the release checks modal and on the release page capsules
export const releaseCheckVerdicts = {
    ready: {
        icon: faCheck,
        color: "success",
        ring: "ring-success",
        staleRing: "ring-success/30",
        label: "Ready to release"
    },
    notReady: {
        icon: faX,
        color: "warning",
        ring: "ring-warning",
        staleRing: "ring-warning/30",
        label: "Not ready to release"
    }
} as const;

/** A stale verdict keeps its hue but fades its ring; `ring` is overwritten so consumers dim without
 *  having to know about staleness */
export function releaseCheckVerdict(entry?: IReleaseCheck, latest?: SemanticVersion) {
    if (!entry) {
        return undefined;
    }
    const verdict = entry.ready ? releaseCheckVerdicts.ready : releaseCheckVerdicts.notReady;
    const stale = isCheckStale(entry, latest);
    return { ...verdict, stale, ring: stale ? verdict.staleRing : verdict.ring };
}
