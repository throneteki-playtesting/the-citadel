import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { faDatabase, faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetPlaytestingUpdateQuery, useSyncPlaytestingUpdateGithubMutation } from "../../api";
import Permission from "common/models/permissions";
import { StatusData } from "./baseStatus";
import { usePermission } from "../../hooks/usePermission";
import { usePlaytestingUpdateSync } from "../../hooks/useSync";

export function useDataUpdateStatus(project: number, version: number) {
    const { data: playtestingUpdate, isLoading } = useGetPlaytestingUpdateQuery({ project, version });

    const [syncPlaytestingUpdateGithub, { isLoading: isSyncing }] = useSyncPlaytestingUpdateGithubMutation();
    const { status, step, error } = usePlaytestingUpdateSync(playtestingUpdate).github.data;
    const hasSyncPermission = usePermission(Permission.SYNC_PLAYTESTINGUPDATE_GITHUB_DATA);

    const data = useMemo<StatusData | null>(() => {
        const title = "Data Changes";
        if (!playtestingUpdate) return null;

        if (status === "start" || status === "progress" || isSyncing) {
            return {
                title,
                icon: <Spinner />,
                description: step ?? "Processing",
                color: "secondary"
            };
        }

        const onPress = hasSyncPermission
            ? () => syncPlaytestingUpdateGithub({ project, version, type: "data" })
            : undefined;

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }

        const dataMeta = playtestingUpdate._metadata?.github?.data;
        if (!dataMeta || (dataMeta.lastSynced && dataMeta.lastSynced < playtestingUpdate.updated)) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        // If its been synced, but no PR was created due to no code changes
        if (dataMeta.lastSynced && !dataMeta.pullRequestUrl) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faDatabase} size="xl" />,
                onPress,
                color: "secondary",
                description: "None Detected"
            };
        }
        if (dataMeta.mergedAt) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faDatabase} size="xl" />,
                description: "Synced",
                color: "success",
                href: dataMeta.pullRequestUrl
            };
        }
        const href = dataMeta.pullRequestUrl;
        const icon = <FontAwesomeIcon icon={faGithub} size="2xl" />;
        switch (dataMeta.status) {
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
    }, [
        playtestingUpdate,
        status,
        isSyncing,
        hasSyncPermission,
        step,
        syncPlaytestingUpdateGithub,
        project,
        version,
        error
    ]);

    return { data, isLoading };
}
