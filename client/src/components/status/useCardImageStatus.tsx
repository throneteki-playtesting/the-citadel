import { faImage, faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { getMostRecent } from "common/utils";
import Permission from "common/models/permissions";
import { useGetCardsQuery, useSyncCardImageMutation } from "../../api";
import { useCardSync } from "../../hooks/useSync";
import { usePermission } from "../../hooks/usePermission";
import { StatusData } from "./baseStatus";

export function useCardImageStatus(project: number, number: number) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, number } });
    const card = useMemo(() => getMostRecent(cardsData?.items ?? []), [cardsData?.items]);

    const [syncCardImage, { isLoading: isSyncing }] = useSyncCardImageMutation();
    const { status, step, error } = useCardSync(card).image;
    const hasSyncPermission = usePermission(Permission.SYNC_CARD_IMAGES);

    const data = useMemo<StatusData | null>(() => {
        const title = "Image URL";
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
            syncCardImage({ project: card.project, number: card.number, version: card.version, forced });
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

        if (!card._metadata?.imageUrl) {
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
            icon: <FontAwesomeIcon icon={faImage} size="xl" />,
            href: card._metadata.imageUrl,
            longPressOptions,
            color: "success",
            description: "Synced"
        };
    }, [card, error, hasSyncPermission, isSyncing, status, step, syncCardImage]);

    return { data, isLoading };
}
