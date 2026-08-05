import { faCheck, faX } from "@fortawesome/free-solid-svg-icons";
import { IReleaseCheck, isCheckStale } from "common/models/slots";
import { SemanticVersion } from "common/utils";

// Tailwind needs literal class names, and HeroUI's numeric shades invert between palettes, so stale
// colours mix the live theme variable with black rather than naming a darker shade
export const staleForegroundClasses = "text-[color-mix(in_oklab,hsl(var(--heroui-foreground)),black_45%)]";

// Shared so a verdict reads identically in the release checks modal and on the release page capsules
export const releaseCheckVerdicts = {
    ready: {
        icon: faCheck,
        color: "success",
        ring: "ring-success",
        staleRing: "ring-[color-mix(in_oklab,hsl(var(--heroui-success)),black_40%)]",
        staleBadge: "bg-[color-mix(in_oklab,hsl(var(--heroui-success)),black_40%)]",
        label: "Ready to release"
    },
    notReady: {
        icon: faX,
        color: "warning",
        ring: "ring-warning",
        staleRing: "ring-[color-mix(in_oklab,hsl(var(--heroui-warning)),black_40%)]",
        staleBadge: "bg-[color-mix(in_oklab,hsl(var(--heroui-warning)),black_40%)]",
        label: "Not ready to release"
    }
} as const;

/** A stale verdict keeps its hue but darkens it; `ring` is overwritten so consumers dim without
 *  having to know about staleness */
export function releaseCheckVerdict(entry?: IReleaseCheck, latest?: SemanticVersion) {
    if (!entry) {
        return undefined;
    }
    const verdict = entry.ready ? releaseCheckVerdicts.ready : releaseCheckVerdicts.notReady;
    const stale = isCheckStale(entry, latest);
    return { ...verdict, stale, ring: stale ? verdict.staleRing : verdict.ring };
}
