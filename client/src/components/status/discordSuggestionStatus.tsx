import { BaseStatus } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { useDiscordSuggestionStatus } from "./useDiscordSuggestionStatus";

export default function DiscordSuggestionStatus({
    className,
    style,
    id,
    isIconOnly,
    size
}: DiscordSuggestionStatusProps) {
    const { data, isLoading } = useDiscordSuggestionStatus(id);

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

type DiscordSuggestionStatusProps = Omit<BaseElementProps, "children"> & {
    id: string;
    isIconOnly?: boolean;
    size?: "sm" | "md" | "lg";
};
