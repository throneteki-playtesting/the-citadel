import { RefObject, useCallback, useEffect, useRef } from "react";
import { FOCUS_GUARD_MS } from "../constants";

// A dropdown list takes focus as it opens or refilters; `guard` sends it back to the input for a moment.
// `release` ends the guard early, as does any click.
export function useInputFocusGuard(inputRef: RefObject<HTMLInputElement | null>) {
    const current = useRef<(() => void) | undefined>(undefined);

    const release = useCallback(() => current.current?.(), []);

    const guard = useCallback(() => {
        release();
        const redirect = (event: FocusEvent) => {
            if (event.target instanceof Element && event.target.closest("[role='listbox']")) {
                inputRef.current?.focus();
            }
        };
        const timer = window.setTimeout(release, FOCUS_GUARD_MS);
        current.current = () => {
            window.clearTimeout(timer);
            document.removeEventListener("focusin", redirect, true);
            document.removeEventListener("pointerdown", release, true);
            current.current = undefined;
        };
        document.addEventListener("focusin", redirect, true);
        document.addEventListener("pointerdown", release, true);
    }, [inputRef, release]);

    useEffect(() => release, [release]);

    return { guard, release };
}
