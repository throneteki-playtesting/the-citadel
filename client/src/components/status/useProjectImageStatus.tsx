import { faCheck, faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { useGetCardsQuery, useSyncProjectImagesMutation } from "../../api";
import { StatusData } from "./baseStatus";
import { usePermission } from "../../hooks/usePermission";
import Permission from "common/models/permissions";

export function useProjectImageStatus(project: number) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, latest: true } });
    const cards = useMemo(() => cardsData?.items ?? [], [cardsData?.items]);
    const total = cards.length;
    const synced = useMemo(() => cards.filter((card) => card._metadata?.imageUrl).length, [cards]);
    const percent = total > 0 ? Math.round((synced / total) * 100) : 0;

    const [syncProjectImages, { isLoading: isSyncing, isError }] = useSyncProjectImagesMutation();
    const hasSyncPermission = usePermission(Permission.SYNC_CARD_IMAGES);

    const data = useMemo<StatusData | null>(() => {
        if (total === 0) {
            return null;
        }

        const title = "Project Images";
        const allSynced = synced === total;
        const onPress = hasSyncPermission && !isSyncing ? () => syncProjectImages({ project, latest: true }) : undefined;

        if (isSyncing) {
            return {
                title,
                icon: <Spinner size="sm" />,
                color: "secondary",
                description: `Syncing ${synced}/${total}...`
            };
        }

        if (isError) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="lg" />,
                onPress,
                color: "danger",
                description: `Failed to Sync (${synced}/${total} synced)`
            };
        }

        if (allSynced) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faCheck} size="lg" />,
                onPress,
                color: "success",
                description: "All card images are synced"
            };
        }

        return {
            title,
            icon: <span>{percent}%</span>,
            onPress,
            color: "secondary",
            description: `${synced}/${total} card images are synced`
        };
    }, [hasSyncPermission, isError, isSyncing, percent, project, synced, syncProjectImages, total]);

    return { data, isLoading, isSyncing };
}
