import { Alert, Button, Listbox, ListboxItem, Popover, PopoverContent, Spinner } from "@heroui/react";
import classNames from "classnames";
import { ReactNode, RefObject, useRef, useState } from "react";
import { BaseElementProps } from "../../types";
import { TouchTooltip } from "../touchTooltip";
import { ActionItem } from "../actions/types";

const TRACE_STROKE = 2;

// Clockwise path starting at bottom-center:
// bottom-left → up left → top-right → down right → back to bottom-center
function buildTracePath(w: number, h: number, sw: number, br: number): string {
    const x = sw / 2;
    const y = sw / 2;
    const W = w - sw;
    const H = h - sw;
    const r = br;
    return [
        `M ${x + W / 2} ${y + H}`,
        `H ${x + r}`,
        `A ${r} ${r} 0 0 1 ${x} ${y + H - r}`,
        `V ${y + r}`,
        `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
        `H ${x + W - r}`,
        `A ${r} ${r} 0 0 1 ${x + W} ${y + r}`,
        `V ${y + H - r}`,
        `A ${r} ${r} 0 0 1 ${x + W - r} ${y + H}`,
        `H ${x + W / 2}`
    ].join(" ");
}

// The rounding lives on whichever element paints it, which isn't always the wrapper's direct child
function resolveBorderRadius(from: Element | null): number {
    let el = from;
    while (el) {
        const radius = parseFloat(window.getComputedStyle(el).borderRadius) || 0;
        if (radius > 0) {
            return radius;
        }
        el = el.firstElementChild;
    }
    return 0;
}

export function BaseStatus({
    isLoading = false,
    data,
    longPressDelay = 1000,
    isIconOnly = false,
    keepTooltipOpen = false,
    size,
    className,
    style,
    traceClassName
}: BaseStatusProps) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const lpRef = useRef({ triggered: false, timer: null as ReturnType<typeof setTimeout> | null });

    const hasLongPress = !!data?.longPressOptions?.length;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const svgPathRef = useRef<SVGPathElement>(null);
    const traceAnimRef = useRef<Animation | null>(null);

    const startTracing = () => {
        const wrapper = wrapperRef.current;
        const svg = svgRef.current;
        const path = svgPathRef.current;
        if (!wrapper || !svg || !path) return;

        const width = wrapper.offsetWidth;
        const height = wrapper.offsetHeight;
        // Fully-rounded buttons compute a 9999px radius, which corrupts the arc unless clamped
        const rawBr = resolveBorderRadius(wrapper.firstElementChild);
        const br = Math.min(rawBr, (Math.min(width, height) - TRACE_STROKE) / 2);
        const sw = TRACE_STROKE;

        svg.setAttribute("width", String(width));
        svg.setAttribute("height", String(height));
        path.setAttribute("d", buildTracePath(width, height, sw, br));

        const color = window.getComputedStyle(svg).borderColor;
        path.setAttribute("stroke", color || "white");

        const length = path.getTotalLength();
        path.style.strokeDasharray = String(length);
        path.style.strokeDashoffset = String(length);

        traceAnimRef.current = path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
            duration: longPressDelay,
            fill: "forwards",
            easing: "linear"
        });
    };

    const stopTracing = () => {
        traceAnimRef.current?.cancel();
        traceAnimRef.current = null;
        const path = svgPathRef.current;
        if (!path) return;
        path.setAttribute("stroke", "transparent");
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
    };

    const startTimer = () => {
        if (!hasLongPress) return;
        lpRef.current.triggered = false;
        startTracing();
        lpRef.current.timer = setTimeout(() => {
            lpRef.current.triggered = true;
            setDropdownOpen(true);
        }, longPressDelay);
    };

    const clearTimer = () => {
        stopTracing();
        if (lpRef.current.timer !== null) {
            clearTimeout(lpRef.current.timer);
            lpRef.current.timer = null;
        }
    };

    const closeDropdown = () => {
        setDropdownOpen(false);
        lpRef.current.triggered = false;
    };

    const interactiveClass = "font-sans hover:brightness-125 transition duration-300 ease-in-out";

    if (!data) return null;

    const lpDomHandlers = {
        onMouseDown: startTimer,
        onMouseUp: clearTimer,
        onMouseLeave: clearTimer,
        onTouchStart: startTimer,
        onTouchEnd: clearTimer,
        onTouchCancel: clearTimer,
        onContextMenu: (e: React.MouseEvent) => {
            if (lpRef.current.triggered) e.preventDefault();
        }
    };

    // The caller's classes belong on the outer-most element, so the traced box matches what is rendered
    const elementClass = hasLongPress ? undefined : className;

    const wrapWithDropdown = (inner: ReactNode, wrapperClass?: string) => (
        <Popover
            isOpen={dropdownOpen}
            onOpenChange={(open) => {
                if (!open) {
                    closeDropdown();
                }
            }}
            triggerRef={wrapperRef as RefObject<HTMLElement>}
            placement="bottom-start"
            classNames={{ content: "p-0" }}
        >
            <div ref={wrapperRef} className={classNames("relative", wrapperClass, className)}>
                {inner}
                <svg
                    ref={svgRef}
                    className={classNames("absolute inset-0 pointer-events-none", traceClassName)}
                    style={{ overflow: "visible" }}
                >
                    <path
                        ref={svgPathRef}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={TRACE_STROKE}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="drop-shadow(0 0 3px rgba(0,0,0,0.6))"
                    />
                </svg>
            </div>
            <PopoverContent>
                <Listbox
                    onAction={(key) => {
                        data.longPressOptions?.[Number(key)]?.fn?.();
                        closeDropdown();
                    }}
                >
                    {(data.longPressOptions ?? []).map((opt, i) => (
                        <ListboxItem key={String(i)}>{opt.label}</ListboxItem>
                    ))}
                </Listbox>
            </PopoverContent>
        </Popover>
    );

    if (isIconOnly) {
        const tooltipContent = (
            <div className="flex flex-col">
                <div className="font-bold">{data.title}</div>
                <div>{data.description}</div>
            </div>
        );

        const handleButtonPress = () => {
            clearTimer();
            if (!lpRef.current.triggered) {
                if (data.href) window.open(data.href, "_blank", "noreferrer");
                else data.onPress?.();
            }
            lpRef.current.triggered = false;
        };

        const button = (
            <Button
                isLoading={isLoading}
                isIconOnly
                size={size}
                color={data.color}
                style={style}
                onPressStart={hasLongPress ? startTimer : undefined}
                onPressEnd={hasLongPress ? clearTimer : undefined}
                onPress={hasLongPress ? handleButtonPress : data.onPress}
                as={hasLongPress ? undefined : data.href ? "a" : undefined}
                href={hasLongPress ? undefined : data.href}
                target={!hasLongPress && data.href ? "_blank" : undefined}
                rel={!hasLongPress && data.href ? "noreferrer" : undefined}
                disableAnimation={!data.onPress && !data.href}
                className={classNames({ [interactiveClass]: !!(data.onPress || data.href) }, elementClass)}
            >
                {data.icon}
            </Button>
        );

        const withTooltip = (
            <TouchTooltip content={tooltipContent} keepOpen={keepTooltipOpen}>
                {button}
            </TouchTooltip>
        );

        return hasLongPress ? wrapWithDropdown(withTooltip, "inline-flex") : withTooltip;
    }

    const alert = (
        <Alert
            icon={isLoading ? <Spinner /> : data.icon}
            color={data.color}
            title={data.title}
            className="h-full opacity-75"
            hideIconWrapper
            description={isLoading ? "Loading..." : data.description}
        />
    );

    if (data.onPress) {
        const handleClick = () => {
            if (lpRef.current.triggered) {
                lpRef.current.triggered = false;
                return;
            }
            data.onPress!();
        };

        const el = (
            <a
                className={classNames("cursor-pointer", interactiveClass, elementClass)}
                style={style}
                onClick={handleClick}
                {...(hasLongPress ? lpDomHandlers : {})}
            >
                {alert}
            </a>
        );

        return hasLongPress ? wrapWithDropdown(el) : el;
    }

    if (data.href) {
        const el = (
            <a
                className={classNames(interactiveClass, elementClass)}
                style={style}
                href={data.href}
                target="_blank"
                rel="noreferrer"
                onClick={
                    hasLongPress
                        ? (e) => {
                              if (lpRef.current.triggered) {
                                  e.preventDefault();
                                  lpRef.current.triggered = false;
                              }
                          }
                        : undefined
                }
                {...(hasLongPress ? lpDomHandlers : {})}
            >
                {alert}
            </a>
        );

        return hasLongPress ? wrapWithDropdown(el) : el;
    }

    const el = (
        <div className={elementClass} style={style} {...(hasLongPress ? lpDomHandlers : {})}>
            {alert}
        </div>
    );

    return hasLongPress ? wrapWithDropdown(el) : el;
}

export type LongPressOption = {
    label: ReactNode;
    fn?: () => unknown;
};

type BaseStatusProps = Omit<BaseElementProps, "children"> & {
    isLoading?: boolean;
    data?: StatusData | null;
    isIconOnly?: boolean;
    longPressDelay?: number;
    traceClassName?: string;
    keepTooltipOpen?: boolean;
    size?: "sm" | "md" | "lg";
};

export type StatusData = Omit<ActionItem, "key" | "icon" | "title" | "color"> & {
    icon?: ReactNode;
    title?: ReactNode;
    color: NonNullable<ActionItem["color"]>;
    longPressOptions?: LongPressOption[];
};
