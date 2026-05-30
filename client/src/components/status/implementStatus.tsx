import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { useCardSync } from "../../api/hooks";
import { useMemo } from "react";
import ThronesIcon from "../thronesIcon";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useSyncCardGithubMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";

const ImplementStatus = ({ className, style, isIconOnly, card }: ImplementStatusProps) => {
    const [syncCardGithub, { isLoading: isSyncing }] = useSyncCardGithubMutation();
    const { status, step, error } = useCardSync(card).github;
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

        const syncAsync = async () => await syncCardGithub({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (card.release) {
            return {
                icon: <ThronesIcon name="power"/>,
                description: "Implemented (Live)",
                color: "success",
                href: "https://theironthrone.net"
            };
        }
        if (!card.github && !card.implemented) {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        if (card.implemented) {
            return {
                icon: <ThronesIcon name="power"/>,
                description: "Implemented",
                color: "success",
                href: "https://playtesting.theironthrone.net"
            };
        }
        const href = card.github!.issueUrl;
        const icon = <FontAwesomeIcon icon={faGithub} size="2xl"/>;
        switch (card.github!.status) {
            case "open": {
                return {
                    icon,
                    description: "Github Issue Open",
                    color: "warning",
                    href
                };
            }
            case "closed": {
                return {
                    icon,
                    description: "Github Issue Closed",
                    color: "success",
                    href
                };
            }
        }
        return null;
    }, [card, error, isSyncing, status, step, syncCardGithub]);

    if (!data) {
        return null;
    }

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={{ title: "Online Platform", ...data }} />;
};

type ImplementStatusProps = Omit<BaseElementProps, "children"> & {
    card?: IPlaytestCard,
    isIconOnly?: boolean
}

export default ImplementStatus;