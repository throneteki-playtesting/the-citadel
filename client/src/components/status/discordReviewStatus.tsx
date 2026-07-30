import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useGetReviewQuery, useSyncReviewDiscordMutation } from "../../api";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { SemanticVersion } from "common/utils";
import { useReviewSync } from "../../hooks/useSync";
import { usePermission } from "../../hooks/usePermission";
import Permission from "common/models/permissions";

export default function DiscordReviewStatus({
    className,
    style,
    project,
    number,
    version,
    reviewer,
    isIconOnly
}: DiscordCardStatusProps) {
    const { data: review, isLoading } = useGetReviewQuery({ project, number, version, reviewer });

    const [syncReviewDiscord, { isLoading: isSyncing }] = useSyncReviewDiscordMutation();
    const { status, step, error } = useReviewSync(review).discord;

    const hasSyncPermission = usePermission(Permission.SYNC_REVIEW_DISCORD);

    const data = useMemo<StatusData | null>(() => {
        const title = "Discord Thread";
        if (!review) {
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

        const syncFn = () => syncReviewDiscord({ project, number, version, reviewer });
        const onPress = hasSyncPermission ? syncFn : undefined;
        const longPressOptions = hasSyncPermission
            ? [
                  {
                      label: (
                          <span>
                              <FontAwesomeIcon icon={faRotate} /> Force Sync
                          </span>
                      ),
                      fn: syncFn
                  }
              ]
            : undefined;

        if (status === "error") {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} />,
                onPress,
                color: "danger",
                description: error ?? "Failed to Sync"
            };
        }
        if (!review._metadata?.discord?.messageUrl) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} />,
                onPress,
                color: "secondary",
                description: "Requires Syncing"
            };
        }

        return {
            title,
            icon: <FontAwesomeIcon icon={faDiscord} />,
            href: review._metadata!.discord!.messageUrl!.replace("https://", "discord://"),
            longPressOptions,
            color: "default",
            description: "Join the discussion"
        };
    }, [
        error,
        hasSyncPermission,
        isSyncing,
        number,
        project,
        review,
        reviewer,
        status,
        step,
        syncReviewDiscord,
        version
    ]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
}

type DiscordCardStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version: SemanticVersion;
    reviewer: string;
    isIconOnly?: boolean;
};
