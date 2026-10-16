import { ReactNode, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import classNames from "classnames";
import { NOTICE_TRANSITION } from "../constants";

/** Takes the height of its content and eases to each new one, scrolling once the content outgrows a max-height in `className` */
export default function AnimatedHeight({ className, children }: AnimatedHeightProps) {
    const outer = useRef<HTMLDivElement>(null);
    const inner = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number>();

    useEffect(() => {
        const content = inner.current;
        if (!content) {
            return;
        }
        // The cap is read back as pixels, or a tall list shrinking would spend the whole easing above what is on show
        const measure = () => {
            const style = outer.current ? getComputedStyle(outer.current) : undefined;
            const padding = style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 0;
            const cap = style ? parseFloat(style.maxHeight) : NaN;
            setHeight(Math.min(content.offsetHeight + padding, Number.isNaN(cap) ? Infinity : cap));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(content);
        window.addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, []);

    return (
        <motion.div
            ref={outer}
            initial={false}
            animate={{ height: height ?? "auto" }}
            transition={NOTICE_TRANSITION}
            className={classNames("overflow-y-auto", className)}
        >
            <div ref={inner}>{children}</div>
        </motion.div>
    );
}

type AnimatedHeightProps = {
    className?: string;
    children: ReactNode;
};
