import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { faDatabase, faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetProjectQuery, useSyncProjectDataMutation } from "../../api";
import Permission from "common/models/permissions";
import { StatusData } from "./baseStatus";
import { usePermission } from "../../hooks/usePermission";
import { useReleaseSync } from "../../hooks/useSync";

// Mirrors useDataUpdateStatus, but reads/stamps IProjectRelease._metadata.github.data instead of a
// playtesting update's - both point at the same underlying data PR, and can legitimately do so at once
export function useReleaseDataStatus(project: number | undefined, code: string) {
    const { data: projectData, isLoading } = useGetProjectQuery(
        { number: project ?? 0 },
        { skip: project === undefined }
    );
    const release = projectData?.releases.find((r) => r.code === code);

    const [syncProjectData, { isLoading: isSyncing }] = useSyncProjectDataMutation();
    const { status, step, error } = useReleaseSync(release && project !== undefined ? { project, code } : undefined)
        .github.data;
    const hasSyncPermission = usePermission(Permission.SYNC_PROJECT_GITHUB_DATA);

    const data = useMemo<StatusData | null>(() => {
        const title = "Data Changes";
        if (!release || project === undefined) return null;

        if (status === "start" || status === "progress" || isSyncing) {
            return {
                title,
                icon: <Spinner />,
                description: step ?? "Processing",
                color: "secondary"
            };
        }

        const syncFn = (forced?: boolean) => syncProjectData({ project, forced });
        const onPress = hasSyncPermission ? () => syncFn() : undefined;
        const longPressOptions = hasSyncPermission
            ? [
                  {
                      label: (
                          <span>
                              <FontAwesomeIcon icon={faRotate} /> Force Sync
                          </span>
                      ),
                      fn: () => syncFn(true)
                  }
              ]
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

        const dataMeta = release._metadata?.github?.data;
        // Both sides are plain ISO strings on the wire (fetchBaseQuery never revives Dates), which already
        // sort chronologically - wrapping either in new Date(...) would compare a Date against a string, always false
        const referenceDate = release.releasedDate ?? release.updated;
        if (!dataMeta || (dataMeta.lastSynced && dataMeta.lastSynced < referenceDate)) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        // If its been synced, but no PR was created due to no data changes
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
                longPressOptions,
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
                    longPressOptions,
                    color: "warning",
                    href
                };
            }
            case "closed": {
                return {
                    title,
                    icon,
                    description: "Github PR Closed",
                    longPressOptions,
                    color: "success",
                    href
                };
            }
        }
        return null;
    }, [release, status, isSyncing, hasSyncPermission, step, syncProjectData, project, error]);

    return { data, isLoading };
}
