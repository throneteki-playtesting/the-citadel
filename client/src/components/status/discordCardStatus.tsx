import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetCardQuery, useSyncCardDiscordMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { SemanticVersion } from "common/utils";
import { useCardSync } from "../../hooks/useSync";
import Permission from "common/models/permissions";
import { usePermission } from "../../hooks/usePermission";

export default function DiscordCardStatus({ className, style, project, number, version, isIconOnly }: DiscordCardStatusProps) {
    const { data: card, isLoading } = useGetCardQuery({ project, number, version: version ?? "latest" });

    const [syncCardDiscord, { isLoading: isSyncing }] = useSyncCardDiscordMutation();
    const { status, step, error } = useCardSync(card).discord;

    const hasSyncPermission = usePermission(Permission.SYNC_CARD_DISCORD);

    const data = useMemo<StatusData | null>(() => {
        const title = "Discord Thread";
        if (!card) {
            return {
                title,
                description: "Unknown",
                color: "default"
            };
        }
        if (status === "start" || status === "progress" || isSyncing) {
            return {
                title,
                icon: <Spinner />,
                description: step ?? "Processing",
                color: "secondary"
            };
        }

        const syncFn = () => syncCardDiscord({ project: card.project, number: card.number, version: card.version });
        const onPress = hasSyncPermission ? syncFn : undefined;
        const longPressOptions = hasSyncPermission ? [{ label: <span><FontAwesomeIcon icon={faRotate} /> Force Sync</span>, fn: syncFn }] : undefined;

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (!card._metadata?.discord?.messageUrl || (card._metadata?.discord?.lastSynced && card._metadata.discord.lastSynced < card.updated)) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "secondary",
                description: "Requires Syncing"
            };
        }

        return {
            title,
            icon: <FontAwesomeIcon icon={faDiscord} size="xl" />,
            href: card._metadata!.discord!.messageUrl!.replace("https://", "discord://"),
            longPressOptions,
            color: "success",
            description: "Synced"
        };
    }, [card, error, hasSyncPermission, isSyncing, status, step, syncCardDiscord]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
};

type DiscordCardStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
}