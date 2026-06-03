import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { usePlaytestingUpdateSync } from "../../api/hooks";
import { useMemo } from "react";
import { BaseElementProps } from "../../types";
import ThronesIcon from "../thronesIcon";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdateQuery, useSyncProjectsGithubMutation } from "../../api";
import { hasPermission } from "common/utils";
import { RootState } from "../../api/store";
import { useSelector } from "react-redux";
import Permission from "common/models/permissions";
import { BaseStatus, StatusData } from "./baseStatus";

const WebsiteUpdateStatus = ({ className, style, project, version, isIconOnly }: WebsiteUpdateStatusProps) => {
    const { data: playtestingUpdate, isLoading: isLoadingPlaytestingUpdate } = useGetPlaytestingUpdateQuery({ project, version });
    const { data: cards, isLoading: isLoadingCards } = useGetPlaytestingUpdateCardsQuery({ project: playtestingUpdate!.project, version: playtestingUpdate!.version }, { skip: !playtestingUpdate });

    const isLoading = isLoadingPlaytestingUpdate || isLoadingCards;

    const [syncProjectsGithub, { isLoading: isSyncing }] = useSyncProjectsGithubMutation();
    const { status, step, error } = usePlaytestingUpdateSync(playtestingUpdate).github;
    const user = useSelector((state: RootState) => state.auth.user);

    const data = useMemo<StatusData | null>(() => {
        const title = "Online Platform";
        if (!playtestingUpdate) {
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

        const syncAsync = hasPermission(user, Permission.SYNC_PROJECT_GITHUB)
            ? async () => await syncProjectsGithub().unwrap()
            : undefined;

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (!playtestingUpdate.github || (playtestingUpdate.github.lastSynced && playtestingUpdate.github.lastSynced < playtestingUpdate.updated)) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        if (playtestingUpdate.github?.mergedAt) {
            if (cards && cards.some((card) => !card.implemented)) {
                return {
                    title,
                    icon: <ThronesIcon name="power"/>,
                    description: "Partially Implemented",
                    color: "success",
                    href: "https://playtesting.theironthrone.net"
                };
            }
            return {
                title,
                icon: <ThronesIcon name="power"/>,
                description: "Implemented",
                color: "success",
                href: "https://playtesting.theironthrone.net"
            };
        }
        const href = playtestingUpdate.github!.pullRequestUrl;
        const icon = <FontAwesomeIcon icon={faGithub} size="2xl"/>;
        switch (playtestingUpdate.github!.status) {
            case "open": {
                return {
                    title,
                    icon,
                    description: "Github PR Open",
                    color: "warning",
                    href
                };
            }
            case "closed": {
                return {
                    title,
                    icon,
                    description: "Github PR Closed",
                    color: "success",
                    href
                };
            }
        }
        return null;
    }, [cards, error, isSyncing, playtestingUpdate, status, step, syncProjectsGithub, user]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
};

type WebsiteUpdateStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    version: number;
    isIconOnly?: boolean;
}

export default WebsiteUpdateStatus;