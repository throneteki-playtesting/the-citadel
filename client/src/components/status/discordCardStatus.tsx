import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { useCardSync } from "../../api/hooks";
import { useMemo } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useSyncCardDiscordMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";

const DiscordCardStatus = ({ className, style, isIconOnly, card }: DiscordCardStatusProps) => {
    const [syncCardDiscord, { isLoading: isSyncing }] = useSyncCardDiscordMutation();
    const { status, step, error } = useCardSync(card).discord;
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

        const syncAsync = async () => await syncCardDiscord({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (!card.discord?.messageUrl || (card.discord?.lastSynced && card.discord.lastSynced < card.cardUpdated)) {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                description: "Requires Syncing"
            };
        }

        return {
            icon: <FontAwesomeIcon icon={faDiscord} size="xl" />,
            href: card.discord!.messageUrl!.replace("https://", "discord://"),
            color: "success",
            description: "Synced"
        };
    }, [card, error, isSyncing, status, step, syncCardDiscord]);

    if (!data) {
        return null;
    }

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={{ title: "Card Thread", ...data }} />;
};

type DiscordCardStatusProps = Omit<BaseElementProps, "children"> & {
    card?: IPlaytestCard,
    isIconOnly?: boolean
}

export default DiscordCardStatus;