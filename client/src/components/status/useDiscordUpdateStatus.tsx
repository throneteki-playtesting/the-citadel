import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import Permission from "common/models/permissions";
import { isAnnouncementStale } from "common/utils";
import {
    useGetPlaytestingUpdateCardsQuery,
    useGetPlaytestingUpdateQuery,
    useSyncPlaytestingUpdateDiscordMutation
} from "../../api";
import { usePlaytestingUpdateSync } from "../../hooks/useSync";
import { usePermission } from "../../hooks/usePermission";
import { StatusData } from "./baseStatus";

export function useDiscordUpdateStatus(project: number, version: number) {
    const { data: playtestingUpdate, isLoading: isLoadingPlaytestingUpdate } = useGetPlaytestingUpdateQuery({
        project,
        version
    });
    const { data: cards, isLoading: isLoadingCards } = useGetPlaytestingUpdateCardsQuery(
        { project, version },
        { skip: !playtestingUpdate }
    );

    const isLoading = isLoadingPlaytestingUpdate || isLoadingCards;

    const [syncPlaytestingUpdateDiscord, { isLoading: isSyncing }] = useSyncPlaytestingUpdateDiscordMutation();
    const { status, step, error } = usePlaytestingUpdateSync(playtestingUpdate).discord;
    const hasSyncPermission = usePermission(Permission.SYNC_PLAYTESTINGUPDATE_DISCORD);

    const data = useMemo<StatusData | null>(() => {
        const title = "Announcement";
        if (!playtestingUpdate) {
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

        const syncFn = (forced?: boolean) => syncPlaytestingUpdateDiscord({ project, version, forced });
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

        const messageUrl = playtestingUpdate._metadata?.discord?.messageUrl;
        if (!messageUrl || isAnnouncementStale(playtestingUpdate, cards ?? [])) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "secondary",
                description: messageUrl ? "Requires Syncing" : "Not Announced"
            };
        }

        return {
            title,
            icon: <FontAwesomeIcon icon={faDiscord} size="xl" />,
            href: messageUrl.replace("https://", "discord://"),
            // Browsers often refuse to open a custom protocol in a new tab
            openInNewTab: false,
            longPressOptions,
            color: "success",
            description: "Announced"
        };
    }, [
        cards,
        error,
        hasSyncPermission,
        isSyncing,
        playtestingUpdate,
        project,
        status,
        step,
        syncPlaytestingUpdateDiscord,
        version
    ]);

    return { data, isLoading };
}
