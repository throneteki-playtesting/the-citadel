import {
    useState,
    useRef,
    useCallback,
    useEffect,
    cloneElement,
    isValidElement,
    type ReactElement,
    type ReactNode,
    type RefObject,
    type PointerEvent as ReactPointerEvent,
    type MouseEvent as ReactMouseEvent
} from "react";
import { Popover, type PopoverProps } from "@heroui/react";
import classNames from "classnames";
import { hapticTap } from "../utils";
import { LONG_PRESS_MS } from "../constants";

// How far a finger may drift during the hold before it reads as a scroll rather than a press.
const MOVE_TOLERANCE = 10;

type TouchPopoverProps = Omit<PopoverProps, "isOpen" | "onOpenChange" | "triggerRef" | "children"> & {
    holdDuration?: number;
    /** Leaves the trigger behaving as it would without a long-press at all */
    isDisabled?: boolean;
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    /** Receives `data-holding` while a press is under way, for press feedback in its own styles */
    trigger: ReactElement;
    /** The PopoverContent */
    children: ReactNode;
};

/** Opens on a touch long-press only - a tap, a mouse click or a scroll all pass through to the trigger untouched */
export function TouchPopover({
    holdDuration = LONG_PRESS_MS,
    isDisabled = false,
    isOpen: isOpenProp,
    onOpenChange,
    trigger,
    children,
    ...props
}: TouchPopoverProps) {
    const [isOpenState, setIsOpenState] = useState(false);
    const isOpen = isOpenProp ?? isOpenState;
    const [isHolding, setIsHolding] = useState(false);
    const triggerRef = useRef<HTMLElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const isTouchRef = useRef(false);
    // A long-press may still end in a click on release, which would otherwise activate the trigger
    // (eg. follow a link) underneath the popover it just opened.
    const suppressClickRef = useRef(false);

    const setOpen = useCallback(
        (open: boolean) => {
            setIsOpenState(open);
            onOpenChange?.(open);
        },
        [onOpenChange]
    );

    const cancelHold = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        startRef.current = null;
        setIsHolding(false);
    }, []);

    useEffect(() => cancelHold, [cancelHold]);

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent) => {
            isTouchRef.current = event.pointerType === "touch";
            suppressClickRef.current = false;
            if (!isTouchRef.current || isDisabled) {
                return;
            }
            startRef.current = { x: event.clientX, y: event.clientY };
            setIsHolding(true);
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                suppressClickRef.current = true;
                setIsHolding(false);
                hapticTap();
                setOpen(true);
            }, holdDuration);
        },
        [isDisabled, holdDuration, setOpen]
    );

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent) => {
            const start = startRef.current;
            if (!start) {
                return;
            }
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) {
                cancelHold();
            }
        },
        [cancelHold]
    );

    const handleClickCapture = useCallback((event: ReactMouseEvent) => {
        if (!suppressClickRef.current) {
            return;
        }
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
    }, []);

    // Only a touch's context menu is ours to take - a right-click keeps the browser's own menu.
    const handleContextMenu = useCallback(
        (event: ReactMouseEvent) => {
            if (isTouchRef.current && !isDisabled) {
                event.preventDefault();
            }
        },
        [isDisabled]
    );

    const triggerProps = isValidElement(trigger) ? (trigger.props as { className?: string }) : {};
    const triggerChild = isValidElement(trigger)
        ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
              ref: triggerRef,
              "data-holding": isHolding,
              className: classNames(triggerProps.className, {
                  "select-none [-webkit-touch-callout:none]": !isDisabled
              }),
              onPointerDown: handlePointerDown,
              onPointerMove: handlePointerMove,
              onPointerUp: cancelHold,
              onPointerCancel: cancelHold,
              onContextMenu: handleContextMenu,
              onClickCapture: handleClickCapture
          })
        : trigger;

    return (
        <Popover {...props} triggerRef={triggerRef as RefObject<HTMLElement>} isOpen={isOpen} onOpenChange={setOpen}>
            {triggerChild}
            <span className="contents" onClick={stopBubbling}>
                {children}
            </span>
        </Popover>
    );
}

// Portalled, but React still bubbles its clicks through the trigger's ancestors - a link among them would follow
function stopBubbling(event: ReactMouseEvent) {
    event.stopPropagation();
}
