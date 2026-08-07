import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import ThronesIcon from "../thronesIcon";
import { faCode, faRotate } from "@fortawesome/free-solid-svg-icons";
import {
    useGetPlaytestingUpdateCardsQuery,
    useGetPlaytestingUpdateQuery,
    useSyncPlaytestingUpdateGithubMutation
} from "../../api";
import Permission from "common/models/permissions";
import { StatusData } from "./baseStatus";
import { usePermission } from "../../hooks/usePermission";
import { usePlaytestingUpdateSync } from "../../hooks/useSync";
import { PLAYTESTING_TIT_URL, summarisePlaytestingUpdate } from "common/utils";

export function useCodeUpdateStatus(project: number, version: number) {
    const { data: playtestingUpdate, isLoading: isLoadingPlaytestingUpdate } = useGetPlaytestingUpdateQuery({
        project,
        version
    });
    const { data: cards, isLoading: isLoadingCards } = useGetPlaytestingUpdateCardsQuery(
        { project, version },
        { skip: !playtestingUpdate }
    );

    const isLoading = isLoadingPlaytestingUpdate || isLoadingCards;
    const { implemented, total, state } = summarisePlaytestingUpdate(cards ?? []);

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

        const syncFn = (forced?: boolean) => syncPlaytestingUpdateGithub({ project, version, type: "code", forced });
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
        // Playability follows the cards themselves, so a card implemented by a later PR still counts
        if (implemented > 0) {
            return {
                title,
                icon: <ThronesIcon name="power" />,
                description: state === "playable" ? "Playable" : `Partially Playable ${implemented}/${total}`,
                longPressOptions,
                color: state === "playable" ? "success" : "warning",
                href: PLAYTESTING_TIT_URL
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
        const href = codeMeta.pullRequestUrl;
        const icon = <FontAwesomeIcon icon={faGithub} size="2xl" />;
        // A merged pull request still implements none of this update whilst its cards remain open
        if (codeMeta.mergedAt) {
            return {
                title,
                icon,
                description: "Not Yet Playable",
                longPressOptions,
                color: "warning",
                href
            };
        }
        switch (codeMeta.status) {
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
    }, [
        error,
        hasSyncPermission,
        implemented,
        isSyncing,
        playtestingUpdate,
        project,
        state,
        status,
        step,
        syncPlaytestingUpdateGithub,
        total,
        version
    ]);

    return { data, isLoading };
}
