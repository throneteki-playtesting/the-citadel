import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { getMostRecent, SemanticVersion } from "common/utils";
import Permission from "common/models/permissions";
import { useGetCardsQuery, useSyncCardGithubMutation } from "../../api";
import { useCardSync } from "../../hooks/useSync";
import { usePermission } from "../../hooks/usePermission";
import ThronesIcon from "../thronesIcon";
import { StatusData } from "./baseStatus";

export function useGithubCardStatus(project: number, number: number, version?: SemanticVersion) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, number, version } });
    const card = useMemo(() => getMostRecent(cardsData?.items ?? []), [cardsData?.items]);

    const [syncCardGithub, { isLoading: isSyncing }] = useSyncCardGithubMutation();
    const { status, step, error } = useCardSync(card).github;

    const hasSyncPermission = usePermission(Permission.SYNC_CARD_GITHUB);

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

        const syncFn = (forced?: boolean) =>
            syncCardGithub({ project: card.project, number: card.number, version: card.version, forced });
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
        if (card.latest && card.released) {
            return {
                title,
                icon: <ThronesIcon name="power" />,
                description: "Implemented (Live)",
                color: "success",
                href: "https://theironthrone.net"
            };
        }
        if (!card._metadata?.github && !card.implemented) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        if (card.implemented) {
            return {
                title,
                icon: <ThronesIcon name="power" />,
                description: "Implemented",
                longPressOptions,
                color: "success",
                href: "https://playtesting.theironthrone.net"
            };
        }
        const href = card._metadata!.github!.issueUrl;
        const icon = <FontAwesomeIcon icon={faGithub} size="2xl" />;
        switch (card._metadata!.github!.status) {
            case "open": {
                return {
                    title,
                    icon,
                    description: "Github Issue Open",
                    longPressOptions,
                    color: "warning",
                    href
                };
            }
            case "closed": {
                return {
                    title,
                    icon,
                    description: "Github Issue Closed",
                    longPressOptions,
                    color: "success",
                    href
                };
            }
        }
        return null;
    }, [card, error, hasSyncPermission, isSyncing, status, step, syncCardGithub]);

    return { data, isLoading };
}
