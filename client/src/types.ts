import { ButtonProps } from "@heroui/react";
import { CSSProperties } from "react";

export type BaseElementProps = {
    children?: React.ReactNode | React.ReactNode[],
    className?: string,
    style?: CSSProperties
}

export type UIColor = NonNullable<ButtonProps["color"]>;