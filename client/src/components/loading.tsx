import { Spinner } from "@heroui/react";
import { ReactNode } from "react";
import { BaseElementProps } from "../types";

const Loading = ({ className, style, label = "Loading...", content, size = "lg" }: LoadingProps) => {
    return (
        <Spinner className={className} style={style} size={size} label={label}>
            {content}
        </Spinner>
    );
};

type LoadingProps = Omit<BaseElementProps, "children"> & {
    label?: string;
    content?: ReactNode | ReactNode[];
    size?: "lg" | "md" | "sm";
};

export default Loading;
