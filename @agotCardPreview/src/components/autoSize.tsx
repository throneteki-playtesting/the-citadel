import React, { CSSProperties, useLayoutEffect, useRef } from "react";
import { px } from "../utils";

const AutoSize = ({ children, className, style, height, rate = 0.01, minimum = 0.4 }: AutoSizeProps) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const elements = useRef(new Map<HTMLElement, number>());
    const lastFit = useRef<{ text: string; width: number; height: number } | null>(null);
    const fontsWaited = useRef(false);

    useLayoutEffect(() => {
        const content = contentRef.current;
        if (!content) {
            return;
        }

        const baseSizes = elements.current;

        const shrink = (el: HTMLElement, multiplier: number) => {
            if (el.style.fontSize) {
                if (!baseSizes.has(el)) {
                    const currentSize = parseFloat(el.style.fontSize);
                    baseSizes.set(el, currentSize);
                }
                const baseSize = baseSizes.get(el) as number;
                el.style.fontSize = px(baseSize * multiplier);
            }

            for (const child of el.children) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    shrink(child as HTMLElement, multiplier);
                }
            }
        };

        const isOverflowing = () =>
            content.scrollWidth > content.clientWidth || content.scrollHeight > content.clientHeight;

        // Fitting resets and re-measures the whole subtree, so it only runs when the text or the
        // available box has actually changed. When the box is content-driven (no fixed dimensions),
        // this is also what stops a fit's own mutations from re-triggering the observer forever
        const isDirty = () => {
            const last = lastFit.current;
            return (
                !last ||
                last.text !== content.textContent ||
                last.width !== content.clientWidth ||
                last.height !== content.clientHeight
            );
        };

        const fit = () => {
            // Reset sizes if they were changed
            for (const [element, baseSize] of [...baseSizes.entries()]) {
                element.style.fontSize = px(baseSize);
                baseSizes.delete(element);
            }

            // Overflow can only occur in a dimension the layout constrains; unconstrained dimensions grow with the content and never trip this
            if (isOverflowing()) {
                // Explicitly set the top-level content so it can scale all inner text that isn't explicitly set
                content.style.fontSize = content.style.fontSize || window.getComputedStyle(content).fontSize;

                // Text reflows as it shrinks, so the measured ratio is only a first approximation - step down from there
                let multiplier = Math.max(
                    minimum,
                    Math.min(content.clientWidth / content.scrollWidth, content.clientHeight / content.scrollHeight)
                );
                shrink(content, multiplier);
                while (multiplier > minimum && isOverflowing()) {
                    multiplier -= rate;
                    shrink(content, multiplier);
                }
            }

            lastFit.current = {
                text: content.textContent ?? "",
                width: content.clientWidth,
                height: content.clientHeight
            };
        };

        if (isDirty()) {
            fit();
        }
        const observer = new ResizeObserver(() => {
            if (isDirty()) {
                fit();
            }
        });
        observer.observe(content);

        // Re-fit once webfonts finish loading, in case the fit above ran against fallback-font metrics
        let cancelled = false;
        if (!fontsWaited.current && typeof document !== "undefined" && document.fonts) {
            fontsWaited.current = true;
            document.fonts.ready.then(() => {
                if (!cancelled && contentRef.current === content) {
                    lastFit.current = null;
                    fit();
                }
            });
        }

        return () => {
            cancelled = true;
            observer.disconnect();
        };
    });

    return (
        <div
            ref={contentRef}
            className={className}
            style={{ ...style, ...(height !== undefined && { height: px(height) }) }}
        >
            {children}
        </div>
    );
};
type AutoSizeProps = {
    children?: React.ReactNode | React.ReactNode[];
    className?: string;
    style?: CSSProperties;
    height?: number;
    rate?: number;
    minimum?: number;
};
export default AutoSize;
