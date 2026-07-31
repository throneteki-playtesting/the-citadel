import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { SemanticVersion } from "common/utils";
import Permission from "common/models/permissions";
import { useGetCardQuery, useSyncCardDiscordMutation } from "../../api";
import { useCardSync } from "../../hooks/useSync";
import { usePermission } from "../../hooks/usePermission";
import { StatusData } from "./baseStatus";

export function useDiscordCardStatus(project: number, number: number, version?: SemanticVersion) {
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

        const syncFn = (forced?: boolean) =>
            syncCardDiscord({ project: card.project, number: card.number, version: card.version, forced });
        const onPress = hasSyncPermission ? () => syncFn() : undefined;
        const longPressOptions = hasSyncPermission
            ? [
                  {
                      label: (
                          <span>
                              <FontAwesomeIcon icon={faRotate} /> Force Sync
                          </span>
                      ),
                      fn: () => syncFn(true)
                  }
              ]
            : undefined;

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (
            !card._metadata?.discord?.messageUrl ||
            (card._metadata?.discord?.lastSynced && card._metadata.discord.lastSynced < card.updated)
        ) {
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
            // Browsers often refuse to open a custom protocol in a new tab
            openInNewTab: false,
            longPressOptions,
            color: "success",
            description: "Synced"
        };
    }, [card, error, hasSyncPermission, isSyncing, status, step, syncCardDiscord]);

    return { data, isLoading };
}
