import { BaseStatus } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { SemanticVersion } from "common/utils";
import { useCardImageStatus } from "./useCardImageStatus";

export default function ImageStatus({ className, style, project, number, isIconOnly, size }: ImageStatusProps) {
    const { data, isLoading } = useCardImageStatus(project, number);

    return (
        <BaseStatus
            className={className}
            style={style}
            isIconOnly={isIconOnly}
            size={size}
            data={data}
            isLoading={isLoading}
        />
    );
}

type ImageStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
    size?: "sm" | "md" | "lg";
};
