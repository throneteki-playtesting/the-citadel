import { BaseStatus } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { SemanticVersion } from "common/utils";
import { useGithubCardStatus } from "./useGithubCardStatus";

export default function GithubCardStatus({
    className,
    style,
    project,
    number,
    version,
    isIconOnly,
    size
}: GithubCardStatusProps) {
    const { data, isLoading } = useGithubCardStatus(project, number, version);

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

type GithubCardStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
    size?: "sm" | "md" | "lg";
};
