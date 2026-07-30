import { useState, useRef, useCallback, cloneElement, isValidElement, type ReactElement } from "react";
import { Popover, PopoverTrigger, type PopoverProps } from "@heroui/react";

type TouchPopoverProps = Omit<PopoverProps, "isOpen" | "onOpenChange"> & {
    holdDuration?: number;
    trigger: React.ReactNode;
};

export function TouchPopover({ holdDuration = 500, trigger, children, ...props }: TouchPopoverProps) {
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

    const triggerChild = isValidElement(trigger)
        ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
              onTouchStart: handleTouchStart,
              onTouchEnd: handleTouchEnd,
              onTouchCancel: handleTouchEnd,
              onTouchMove: handleTouchMove
          })
        : trigger;

    return (
        <Popover {...props} isOpen={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger>{triggerChild}</PopoverTrigger>
            {children}
        </Popover>
    );
}
