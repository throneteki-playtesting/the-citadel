import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { useGetCardsQuery, useSyncCardImageMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { getMostRecent, SemanticVersion } from "common/utils";
import { useCardSync } from "../../hooks/useSync";

export default function ImageStatus({ className, style, project, number, isIconOnly }: ImageStatusProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, number } });
    const card = useMemo(() => getMostRecent(cardsData?.items ?? []), [cardsData?.items]);

    const [syncCardImage, { isLoading: isSyncing }] = useSyncCardImageMutation();
    const { status, step, error } = useCardSync(card).image;
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

        const syncAsync = async () => await syncCardImage({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl"/>,
                onPress: syncAsync,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }

        if (!card._metadata?.imageUrl) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                description: "Requires Syncing"
            };
        }

        return {
            title,
            href: card._metadata.imageUrl,
            color: "success",
            description: "Synced"
        };
    }, [card, error, isSyncing, status, step, syncCardImage]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
};

type ImageStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
}