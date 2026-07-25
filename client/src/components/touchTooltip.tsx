import { useCallback, useEffect, useRef, useState, cloneElement, isValidElement, type ReactElement, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Tooltip, type TooltipProps } from "@heroui/react";

export function TouchTooltip({ onOpenChange, children, ...props }: TooltipProps) {
    const [isOpen, setIsOpenState] = useState(false);
    const isOpenRef = useRef(false);
    const isTouchRef = useRef(false);
    const triggerRef = useRef<HTMLElement | null>(null);

    const setOpen = useCallback((open: boolean) => {
        isOpenRef.current = open;
        setIsOpenState(open);
        onOpenChange?.(open);
    }, [onOpenChange]);

    // react-aria's useTooltipTrigger force-closes on every pointerdown on the trigger (its
    // onPressStart), ahead of the click event. On touch we drive open/close ourselves via
    // handleClickCapture, so library-initiated changes are ignored to avoid the two fighting.
    const handleTooltipOpenChange = useCallback((open: boolean) => {
        if (isTouchRef.current) {
            return;
        }
        setOpen(open);
    }, [setOpen]);

    const handlePointerDownCapture = useCallback((event: ReactPointerEvent) => {
        isTouchRef.current = event.pointerType === "touch";
    }, []);

    const handleClickCapture = useCallback((event: ReactMouseEvent) => {
        if (!isTouchRef.current) {
            return;
        }
        if (isOpenRef.current) {
            setOpen(false);
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
    }, [setOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const handleOutsidePointerDown = (event: PointerEvent) => {
            if (!triggerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isOpen, setOpen]);

    const child = isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            ref: triggerRef,
            onPointerDownCapture: handlePointerDownCapture,
            onClickCapture: handleClickCapture
        })
        : children;

    return (
        <Tooltip {...props} isOpen={isOpen} onOpenChange={handleTooltipOpenChange}>
            {child}
        </Tooltip>
    );
}
