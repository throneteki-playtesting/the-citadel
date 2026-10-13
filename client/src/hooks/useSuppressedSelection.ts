import { useEffect } from "react";

// A long press on large text can start a selection or a context menu whatever user-select says, and either cancels the
// touch before a drag's delay is up
export function useSuppressedSelection(element: HTMLElement | null, isActive: boolean) {
    useEffect(() => {
        if (!element || !isActive) {
            return;
        }
        const prevent = (event: Event) => event.preventDefault();
        element.addEventListener("selectstart", prevent);
        element.addEventListener("contextmenu", prevent);
        return () => {
            element.removeEventListener("selectstart", prevent);
            element.removeEventListener("contextmenu", prevent);
        };
    }, [element, isActive]);
}
