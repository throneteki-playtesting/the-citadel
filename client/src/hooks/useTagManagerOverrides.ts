import { useEffect, useRef } from "react";
import { registerTagManagerOverride, TagManagerOverrides } from "../api/tagManager";

// Registers a temporary override of tag-manager behaviour (eg. autoRefresh) for as long as the calling component is mounted
export function useTagManagerOverrides(overrides: TagManagerOverrides): void {
    const overridesRef = useRef(overrides);
    overridesRef.current = overrides;

    const key = JSON.stringify(overrides);

    useEffect(() => registerTagManagerOverride(overridesRef.current), [key]);
}
