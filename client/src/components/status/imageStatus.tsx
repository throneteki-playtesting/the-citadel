import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Spinner } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { ReactNode, useMemo } from "react";
import { useCardSync } from "../../api/hooks";
import { UIColor } from "../../types";
import { useSyncCardImageMutation } from "../../api";

type StatusData = { icon?: ReactNode, label: string, color: UIColor, onPress?: () => void, href?: string };

const ImageStatus = ({ card }: ImageStatusProps) => {
    const [syncCardImage, { isLoading: isSyncing }] = useSyncCardImageMutation();
    const { status, step, error } = useCardSync(card).image;
    const data = useMemo<StatusData | null>(() => {
        if (!card) {
            return null;
        }

        if (status === "start" || status === "progress" || isSyncing) {
            return {
                icon: <Spinner />,
                label: step ?? "Processing",
                color: "secondary"
            };
        }

        const syncAsync = async () => await syncCardImage({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl"/>,
                onPress: syncAsync,
                color: "danger",
                label: error ?? "Failed to Sync"
            };
        }

        if (!card.imageUrl) {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                label: "Requires Syncing"
            };
        }

        return {
            href: card.imageUrl,
            color: "success",
            label: "Synced"
        };
    }, [card, error, isSyncing, status, step, syncCardImage]);

    if (!data) {
        return null;
    }
    const alert = <Alert icon={data.icon} color={data.color} title="Image URL" className="h-full" hideIconWrapper description={data.label}></Alert>;
    if (data.onPress) {
        return <a className="cursor-pointer hover:brightness-125 transition duration-300 ease-in-out" onClick={data.onPress}>{alert}</a>;
    }
    if (data.href) {
        return <a className="hover:brightness-125 transition duration-300 ease-in-out" href={data.href} target={"_blank"}>{alert}</a>;
    }
    return alert;
};

type ImageStatusProps = { card?: IPlaytestCard }

export default ImageStatus;