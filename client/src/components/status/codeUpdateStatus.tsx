import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { BaseElementProps } from "../../types";
import ThronesIcon from "../thronesIcon";
import { faCode, faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdateQuery, useSyncPlaytestingUpdateGithubMutation } from "../../api";
import Permission from "common/models/permissions";
import { BaseStatus, StatusData } from "./baseStatus";
import { usePermission } from "../../hooks/usePermission";
import { usePlaytestingUpdateSync } from "../../hooks/useSync";

export default function CodeUpdateStatus({ className, style, project, version, isIconOnly }: CodeUpdateStatusProps) {
    const { data: playtestingUpdate, isLoading: isLoadingPlaytestingUpdate } = useGetPlaytestingUpdateQuery({ project, version });
    const { data: cards, isLoading: isLoadingCards } = useGetPlaytestingUpdateCardsQuery({ project: playtestingUpdate!.project, version: playtestingUpdate!.version }, { skip: !playtestingUpdate });

    const isLoading = isLoadingPlaytestingUpdate || isLoadingCards;

    const [syncPlaytestingUpdateGithub, { isLoading: isSyncing }] = useSyncPlaytestingUpdateGithubMutation();
    const { status, step, error } = usePlaytestingUpdateSync(playtestingUpdate).github.code;
    const hasSyncPermission = usePermission(Permission.SYNC_PLAYTESTINGUPDATE_GITHUB_CODE);

    const data = useMemo<StatusData | null>(() => {
        const title = "Code Changes";
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

        const syncFn = () => syncPlaytestingUpdateGithub({ project, version, type: "code" });
        const onPress = hasSyncPermission ? syncFn : undefined;
        const longPressOptions = hasSyncPermission ? [{ label: <span><FontAwesomeIcon icon={faRotate} /> Force Sync</span>, fn: syncFn }] : undefined;

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }

        const codeMeta = playtestingUpdate._metadata?.github?.code;
        if (!codeMeta || (codeMeta.lastSynced && codeMeta.lastSynced < playtestingUpdate.updated)) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        // If its been synced, but no PR was created due to no code changes
        if (codeMeta.lastSynced && !codeMeta.pullRequestUrl) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faCode} size="xl" />,
                onPress,
                color: "secondary",
                description: "None Implemented"
            };
        }
        if (codeMeta.mergedAt) {
            if (cards && cards.some((card) => !card.implemented)) {
                return {
                    title,
                    icon: <ThronesIcon name="power"/>,
                    longPressOptions,
                    description: "Partially Implemented",
                    color: "success",
                    href: "https://playtesting.theironthrone.net"
                };
            }
            return {
                title,
                icon: <ThronesIcon name="power"/>,
                longPressOptions,
                description: "Implemented",
                color: "success",
                href: "https://playtesting.theironthrone.net"
            };
        }
        const href = codeMeta.pullRequestUrl;
        const icon = <FontAwesomeIcon icon={faGithub} size="2xl"/>;
        switch (codeMeta.status) {
            case "open": {
                return {
                    title,
                    icon,
                    longPressOptions,
                    description: "Github PR Open",
                    color: "warning",
                    href
                };
            }
            case "closed": {
                return {
                    title,
                    icon,
                    longPressOptions,
                    description: "Github PR Closed",
                    color: "success",
                    href
                };
            }
        }
        return null;
    }, [cards, error, hasSyncPermission, isSyncing, playtestingUpdate, project, status, step, syncPlaytestingUpdateGithub, version]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
}

type CodeUpdateStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    version: number;
    isIconOnly?: boolean;
}
