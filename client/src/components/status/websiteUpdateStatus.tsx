import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { usePlaytestingUpdateSync } from "../../api/hooks";
import { useMemo } from "react";
import { BaseElementProps } from "../../types";
import ThronesIcon from "../thronesIcon";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetPlaytestingUpdateCardsQuery, useSyncProjectsGithubMutation } from "../../api";
import { IPlaytestingUpdate } from "common/models/projects";
import { hasPermission } from "common/utils";
import { RootState } from "../../api/store";
import { useSelector } from "react-redux";
import Permission from "common/models/permissions";
import { BaseStatus, StatusData } from "./baseStatus";

const WebsiteUpdateStatus = ({ className, style, isIconOnly = false, playtestingUpdate }: WebsiteUpdateStatusProps) => {
    const { data: cards } = useGetPlaytestingUpdateCardsQuery({ project: playtestingUpdate!.project, version: playtestingUpdate!.version }, { skip: !playtestingUpdate });
    const [syncProjectsGithub, { isLoading: isSyncing }] = useSyncProjectsGithubMutation();
    const { status, step, error } = usePlaytestingUpdateSync(playtestingUpdate).github;
    const user = useSelector((state: RootState) => state.auth.user);

    const data = useMemo<StatusData | null>(() => {
        if (!playtestingUpdate) {
            return null;
        }
        if (status === "start" || status === "progress" || isSyncing) {
            return {
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
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (!playtestingUpdate.github || (playtestingUpdate.github.lastSynced && playtestingUpdate.github.lastSynced < playtestingUpdate.updated)) {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        if (playtestingUpdate.github?.mergedAt) {
            if (cards && cards.some((card) => !card.implemented)) {
                return {
                    icon: <ThronesIcon name="power"/>,
                    description: "Partially Implemented",
                    color: "success",
                    href: "https://playtesting.theironthrone.net"
                };
            }
            return {
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
                    icon,
                    description: "Github PR Open",
                    color: "warning",
                    href
                };
            }
            case "closed": {
                return {
                    icon,
                    description: "Github PR Closed",
                    color: "success",
                    href
                };
            }
        }
        return null;
    }, [cards, error, isSyncing, playtestingUpdate, status, step, syncProjectsGithub, user]);

    if (!data) {
        return null;
    }

    return <BaseStatus className={className} style={style} data={{ title: "Online Platform", ...data }} isIconOnly={isIconOnly} />;
};

type WebsiteUpdateStatusProps = Omit<BaseElementProps, "children"> & {
    playtestingUpdate?: IPlaytestingUpdate,
    isIconOnly?: boolean
}

export default WebsiteUpdateStatus;