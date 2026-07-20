import { useState, useRef, useCallback, cloneElement, isValidElement, type ReactElement } from "react";
import { Tooltip, type TooltipProps } from "@heroui/react";

type TouchTooltipProps = Omit<TooltipProps, "isOpen" | "onOpenChange"> & {
  holdDuration?: number;
  keepOpen?: boolean;
};

export function TouchTooltip({ holdDuration = 500, keepOpen = false, children, ...props }: TouchTooltipProps) {
    const [isOpen, setIsOpen] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTouchStart = useCallback(() => {
        timerRef.current = setTimeout(() => setIsOpen(true), holdDuration);
    }, [holdDuration]);

    const handleTouchEnd = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleTouchMove = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setIsOpen(false);
    }, []);

    const handlePointerEnter = useCallback(() => setIsOpen(true), []);
    const handlePointerLeave = useCallback(() => setIsOpen(false), []);
    const handleFocus = useCallback(() => setIsOpen(true), []);
    const handleBlur = useCallback(() => setIsOpen(false), []);

    const child = isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            onTouchStart: handleTouchStart,
            onTouchEnd: handleTouchEnd,
            onTouchCancel: handleTouchEnd,
            onTouchMove: handleTouchMove,
            onMouseEnter: handlePointerEnter,
            onMouseLeave: handlePointerLeave,
            onFocus: handleFocus,
            onBlur: handleBlur
        })
        : children;

    return (
        <Tooltip {...props} isOpen={keepOpen || isOpen}>
            {child}
        </Tooltip>
    );
}