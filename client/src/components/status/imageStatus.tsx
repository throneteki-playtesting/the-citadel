import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { useMemo } from "react";
import { useCardSync } from "../../api/hooks";
import { useSyncCardImageMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";

const ImageStatus = ({ className, style, isIconOnly, card }: ImageStatusProps) => {
    const [syncCardImage, { isLoading: isSyncing }] = useSyncCardImageMutation();
    const { status, step, error } = useCardSync(card).image;
    const data = useMemo<StatusData | null>(() => {
        if (!card) {
            return null;
        }

        if (status === "start" || status === "progress" || isSyncing) {
            return {
                icon: <Spinner />,
                description: step ?? "Processing",
                color: "secondary"
            };
        }

        const syncAsync = async () => await syncCardImage({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl"/>,
                onPress: syncAsync,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }

        if (!card.imageUrl) {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                description: "Requires Syncing"
            };
        }

        return {
            href: card.imageUrl,
            color: "success",
            description: "Synced"
        };
    }, [card, error, isSyncing, status, step, syncCardImage]);

    if (!data) {
        return null;
    }

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={{ title: "Image URL", ...data }} />;
};

type ImageStatusProps = Omit<BaseElementProps, "children"> & {
    card?: IPlaytestCard,
    isIconOnly?: boolean
}

export default ImageStatus;