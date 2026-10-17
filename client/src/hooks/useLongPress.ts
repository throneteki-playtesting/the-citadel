import { MouseEvent, PointerEvent, useRef } from "react";

// A touch held for `delayMs` fires instead of the tap, swallowing the context menu the browser would open for it
export function useLongPress(delayMs: number) {
    const pressRef = useRef<{ timer?: ReturnType<typeof setTimeout>; isPressing: boolean; hasFired: boolean }>({
        isPressing: false,
        hasFired: false
    });

    const cancel = () => {
        clearTimeout(pressRef.current.timer);
        pressRef.current.isPressing = false;
    };

    const bind = (onLongPress: () => void) => ({
        onPointerDown: (e: PointerEvent) => {
            if (e.pointerType !== "touch") {
                return;
            }
            const press = pressRef.current;
            clearTimeout(press.timer);
            press.isPressing = true;
            press.hasFired = false;
            press.timer = setTimeout(() => {
                press.isPressing = false;
                press.hasFired = true;
                onLongPress();
            }, delayMs);
        },
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onPointerCancel: cancel,
        onContextMenu: (e: MouseEvent) => {
            if (pressRef.current.isPressing || pressRef.current.hasFired) {
                e.preventDefault();
            }
        }
    });

    // True once for the click that ends a long press, which the caller should then ignore
    const consumeLongPress = () => {
        const hasFired = pressRef.current.hasFired;
        pressRef.current.hasFired = false;
        return hasFired;
    };

    return { bind, consumeLongPress };
}
