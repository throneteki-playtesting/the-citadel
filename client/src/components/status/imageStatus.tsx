import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Spinner } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { useSyncCardImagesMutation } from "../../api";
import { ReactNode, useMemo } from "react";
import { useCardSync } from "../../api/hooks";
import { UIColor } from "../../types";

type StatusData = { icon?: ReactNode, label: string, color: UIColor, onPress?: () => void };

const ImageStatus = ({ card }: ImageStatusProps) => {
    const [syncCardImage, { isLoading: isSyncing }] = useSyncCardImagesMutation();
    const { status, step, error } = useCardSync(card).image;
    const data = useMemo<StatusData | null>(() => {
        if (!card) {
            return null;
        }

        if (status === "progress" || isSyncing) {
            return {
                icon: <Spinner />,
                label: step ?? status ?? "Processing",
                color: "secondary"
            };
        }

        if ((!card.imageUrl && status !== "complete") || status === "error") {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl"/>,
                onPress: async () => await syncCardImage({ project: card.project, number: card.number, version: card.version }).unwrap(),
                color: "danger",
                label: error ?? "Requires Sync"
            };
        }

        return {
            color: "success",
            label: "Synced"
        };
    }, [card, error, isSyncing, status, step, syncCardImage]);

    if (!data) {
        return null;
    }
    const alert = <Alert icon={data.icon} color={data.color} title="Image URL" className="h-full" hideIconWrapper description={data.label}></Alert>;
    if (data.onPress) {
        return <a className="cursor-pointer" onClick={data.onPress}>{alert}</a>;
    }
    return alert;
};

type ImageStatusProps = { card?: IPlaytestCard }

export default ImageStatus;