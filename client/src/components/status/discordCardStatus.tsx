import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Spinner } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { useCardSync } from "../../api/hooks";
import { ReactNode, useMemo } from "react";
import { UIColor } from "../../types";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useSyncCardDiscordMutation } from "../../api";

type StatusData = { icon?: ReactNode, label: string, color: UIColor, onPress?: () => void, href?: string };

const DiscordCardStatus = ({ card }: DiscordCardStatusProps) => {
    const [syncCardDiscord, { isLoading: isSyncing }] = useSyncCardDiscordMutation();
    const { status, step, error } = useCardSync(card).discord;
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

        const syncAsync = async () => await syncCardDiscord({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "danger",
                label: error ?? "Failed to Sync"
            };
        }
        if (!card.discord?.messageUrl || (card.discord?.lastSynced && card.discord.lastSynced < card.cardUpdated)) {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                label: "Requires Syncing"
            };
        }

        return {
            icon: <FontAwesomeIcon icon={faDiscord} size="xl" />,
            href: card.discord!.messageUrl!.replace("https://", "discord://"),
            color: "success",
            label: "Synced"
        };
        return null;
    }, [card, error, isSyncing, status, step, syncCardDiscord]);

    if (!data) {
        return null;
    }
    const alert = <Alert icon={data.icon} color={data.color} title="Card Thread" className="h-full" hideIconWrapper description={data.label}></Alert>;
    if (data.onPress) {
        return <a className="cursor-pointer" onClick={data.onPress}>{alert}</a>;
    }
    if (data.href) {
        return <a href={data.href} target={"_blank"}>{alert}</a>;
    }
    return alert;
};

type DiscordCardStatusProps = { card?: IPlaytestCard }

export default DiscordCardStatus;