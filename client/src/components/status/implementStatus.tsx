import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useCardSync } from "../../api/hooks";
import { useMemo } from "react";
import ThronesIcon from "../thronesIcon";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetCardsQuery, useSyncCardGithubMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { getMostRecent, SemanticVersion } from "common/utils";

const ImplementStatus = ({ className, style, project, number, version, isIconOnly }: ImplementStatusProps) => {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, number, version } });
    const card = useMemo(() => getMostRecent(cardsData?.items ?? []), [cardsData?.items]);

    const [syncCardGithub, { isLoading: isSyncing }] = useSyncCardGithubMutation();
    const { status, step, error } = useCardSync(card).github;
    const data = useMemo<StatusData | null>(() => {
        const title = "Online Platform";
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

        const syncAsync = async () => await syncCardGithub({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (card.release) {
            return {
                title,
                icon: <ThronesIcon name="power"/>,
                description: "Implemented (Live)",
                color: "success",
                href: "https://theironthrone.net"
            };
        }
        if (!card.github && !card.implemented) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        if (card.implemented) {
            return {
                title,
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
                    title,
                    icon,
                    description: "Github Issue Open",
                    color: "warning",
                    href
                };
            }
            case "closed": {
                return {
                    title,
                    icon,
                    description: "Github Issue Closed",
                    color: "success",
                    href
                };
            }
        }
        return null;
    }, [card, error, isSyncing, status, step, syncCardGithub]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
};

type ImplementStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
}

export default ImplementStatus;