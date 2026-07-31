import { BaseStatus } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { SemanticVersion } from "common/utils";
import { useDiscordCardStatus } from "./useDiscordCardStatus";

export default function DiscordCardStatus({
    className,
    style,
    project,
    number,
    version,
    isIconOnly,
    size
}: DiscordCardStatusProps) {
    const { data, isLoading } = useDiscordCardStatus(project, number, version);

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

type DiscordCardStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
    size?: "sm" | "md" | "lg";
};
