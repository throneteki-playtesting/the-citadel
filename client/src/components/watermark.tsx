import classNames from "classnames";
import { ReactNode } from "react";

const positionClasses: Record<WatermarkPosition, string> = {
    "top-left": "top-0 left-0",
    top: "inset-0 items-start justify-center",
    "top-right": "top-0 right-0",
    left: "inset-0 items-center justify-start",
    center: "inset-0 items-center justify-center",
    right: "inset-0 items-center justify-end",
    "bottom-left": "bottom-0 left-0",
    bottom: "inset-0 items-end justify-center",
    "bottom-right": "bottom-0 right-0"
};

export default function Watermark({
    icon,
    position = "center",
    className,
    containerClassName,
    children
}: WatermarkProps) {
    const layer = (
        <div
            className={classNames(
                "absolute flex pointer-events-none select-none",
                positionClasses[position],
                className
            )}
        >
            {icon}
        </div>
    );

    if (children === undefined) {
        return layer;
    }

    return (
        <div className={classNames("relative overflow-hidden", containerClassName)}>
            {layer}
            {children}
        </div>
    );
}

export type WatermarkPosition =
    | "top-left"
    | "top"
    | "top-right"
    | "left"
    | "center"
    | "right"
    | "bottom-left"
    | "bottom"
    | "bottom-right";

type WatermarkProps = {
    icon: ReactNode;
    position?: WatermarkPosition;
    className?: string;
    containerClassName?: string;
    children?: ReactNode;
};
