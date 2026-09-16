import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import Permission from "common/models/permissions";
import { useGetSuggestionQuery, useSyncSuggestionDiscordMutation } from "../../api";
import { useSuggestionSync } from "../../hooks/useSync";
import { usePermission } from "../../hooks/usePermission";
import { StatusData } from "./baseStatus";
import { useDiscordHref } from "../../hooks/useDiscordLink";

export function useDiscordSuggestionStatus(id: string) {
    const { data: suggestion, isLoading } = useGetSuggestionQuery(id, { skip: !id });

    const [syncSuggestionDiscord, { isLoading: isSyncing }] = useSyncSuggestionDiscordMutation();
    const { status, step, error } = useSuggestionSync({ id }).discord;

    const hasSyncPermission = usePermission(Permission.SYNC_SUGGESTIONS_DISCORD);
    const { href, isApp } = useDiscordHref(suggestion?._metadata?.discord?.messageUrl ?? "");

    const data = useMemo<StatusData | null>(() => {
        const title = "Discord Thread";
        if (!suggestion) {
            return {
                title,
                description: "Unknown",
                color: "default"
            };
        }
        if (suggestion.draft) {
            return {
                title,
                description: "Not yet submitted",
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

        const syncFn = (forced?: boolean) => syncSuggestionDiscord({ id: suggestion.id!, forced });
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
                icon: <FontAwesomeIcon icon={faRotate} />,
                onPress,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (!suggestion._metadata?.discord?.messageUrl) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} />,
                onPress,
                color: "secondary",
                description: "Requires Syncing"
            };
        }

        return {
            title,
            icon: <FontAwesomeIcon icon={faDiscord} />,
            href,
            // Browsers often refuse to open a custom protocol in a new tab
            openInNewTab: !isApp,
            longPressOptions,
            color: "success",
            description: "Synced"
        };
    }, [error, hasSyncPermission, href, isApp, isSyncing, status, step, suggestion, syncSuggestionDiscord]);

    return { data, isLoading };
}
