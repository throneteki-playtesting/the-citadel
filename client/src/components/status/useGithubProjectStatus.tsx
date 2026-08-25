import { faCheck, faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { useSyncProjectGithubMutation } from "../../api";
import { StatusData } from "./baseStatus";
import { usePermission } from "../../hooks/usePermission";
import Permission from "common/models/permissions";
import { useVisibleProjectCards } from "./useVisibleProjectCards";

function isSynced(card: {
    _metadata?: { github?: { issueUrl?: string; lastSynced?: Date } };
    implemented: boolean;
    updated: Date;
}) {
    if (card.implemented) {
        return true;
    }
    const github = card._metadata?.github;
    return !!github?.issueUrl && (!github.lastSynced || github.lastSynced >= card.updated);
}

export function useGithubProjectStatus(project: number) {
    const { cards, isLoading } = useVisibleProjectCards(project);
    const total = cards.length;
    const synced = useMemo(() => cards.filter(isSynced).length, [cards]);
    const percent = total > 0 ? Math.round((synced / total) * 100) : 0;

    const [syncProjectGithub, { isLoading: isSyncing, isError }] = useSyncProjectGithubMutation();
    const hasSyncPermission = usePermission(Permission.SYNC_CARD_GITHUB);

    const data = useMemo<StatusData | null>(() => {
        if (total === 0) {
            return null;
        }

        const title = "Project Github Issues";
        const allSynced = synced === total;
        const syncFn = (forced?: boolean) => syncProjectGithub({ project, forced });
        const onPress = hasSyncPermission && !isSyncing ? () => syncFn() : undefined;
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

        if (isSyncing) {
            return {
                title,
                icon: <Spinner size="sm" />,
                color: "secondary",
                description: `Syncing ${synced}/${total}...`
            };
        }

        if (isError) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="lg" />,
                onPress,
                longPressOptions,
                color: "danger",
                description: `Failed to Sync (${synced}/${total} synced)`
            };
        }

        if (allSynced) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faCheck} size="lg" />,
                longPressOptions,
                color: "success",
                description: "All card issues are synced"
            };
        }

        return {
            title,
            icon: <span>{percent}%</span>,
            onPress,
            longPressOptions,
            color: "secondary",
            description: `${synced}/${total} card issues are synced`
        };
    }, [hasSyncPermission, isError, isSyncing, percent, project, synced, syncProjectGithub, total]);

    return { data, isLoading, isSyncing };
}
