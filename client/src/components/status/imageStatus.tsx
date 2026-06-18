import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { useGetCardsQuery, useSyncCardImageMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { getMostRecent, SemanticVersion } from "common/utils";
import { useCardSync } from "../../hooks/useSync";
import { usePermission } from "../../hooks/usePermission";
import Permission from "common/models/permissions";

export default function ImageStatus({ className, style, project, number, isIconOnly }: ImageStatusProps) {
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

        const syncFn = () => syncCardImage({ project: card.project, number: card.number, version: card.version });
        const onPress = hasSyncPermission ? syncFn : undefined;
        const longPressOptions = hasSyncPermission ? [{ label: <span><FontAwesomeIcon icon={faRotate} /> Force Sync</span>, fn: syncFn }] : undefined;

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl"/>,
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
            href: card._metadata.imageUrl,
            longPressOptions,
            color: "success",
            description: "Synced"
        };
    }, [card, error, hasSyncPermission, isSyncing, status, step, syncCardImage]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
};

type ImageStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
}