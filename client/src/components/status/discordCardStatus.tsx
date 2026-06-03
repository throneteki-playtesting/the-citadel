import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useCardSync } from "../../api/hooks";
import { useMemo } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetCardsQuery, useSyncCardDiscordMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { getMostRecent, SemanticVersion } from "common/utils";

const DiscordCardStatus = ({ className, style, project, number, version, isIconOnly }: DiscordCardStatusProps) => {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, number, version } });
    const card = useMemo(() => getMostRecent(cardsData?.items ?? []), [cardsData?.items]);

    const [syncCardDiscord, { isLoading: isSyncing }] = useSyncCardDiscordMutation();
    const { status, step, error } = useCardSync(card).discord;
    const data = useMemo<StatusData | null>(() => {
        const title = "Card Thread";
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

        const syncAsync = async () => await syncCardDiscord({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (!card.discord?.messageUrl || (card.discord?.lastSynced && card.discord.lastSynced < card.cardUpdated)) {
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
            icon: <FontAwesomeIcon icon={faDiscord} size="xl" />,
            href: card.discord!.messageUrl!.replace("https://", "discord://"),
            color: "success",
            description: "Synced"
        };
    }, [card, error, isSyncing, status, step, syncCardDiscord]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
};

type DiscordCardStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
}


export default DiscordCardStatus;