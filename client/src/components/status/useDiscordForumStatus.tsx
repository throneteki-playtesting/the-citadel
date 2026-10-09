import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";
import { IProject } from "common/models/projects";
import { useSyncProjectDiscordMutation } from "../../api";
import { useProjectSync } from "../../hooks/useSync";
import { useDiscordHref } from "../../hooks/useDiscordLink";
import Timestamp from "../timestamp";
import { StatusData } from "./baseStatus";

// A draft project's planning forum: a way in once it is there, and a way to make it where it isn't
export function useDiscordForumStatus(project: IProject) {
    const discord = project._metadata?.discord;
    const { href, isApp } = useDiscordHref(discord?.forumUrl ?? "");
    const [syncDiscord, { isLoading: isRequesting, isError: isRequestError }] = useSyncProjectDiscordMutation();
    // What the server reports as it goes - the request itself only says it was made, or that it failed outright
    const { status, step, error, retryAt } = useProjectSync(project).discord;
    const isSyncing = isRequesting || status === "start" || status === "progress";
    const isError = isRequestError || status === "error";

    return useMemo<StatusData | null>(() => {
        if (!project.draft) {
            return null;
        }
        const title = "Planning Forum";
        const syncFn = (forced?: boolean) => syncDiscord({ project: project.number, forced });
        const longPressOptions = [
            {
                label: (
                    <span>
                        <FontAwesomeIcon icon={faRotate} /> Force Sync
                    </span>
                ),
                fn: () => syncFn(true)
            }
        ];

        if (isSyncing) {
            return { title, icon: <Spinner />, color: "secondary", description: step ?? "Processing" };
        }
        if (isError) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: () => syncFn(),
                longPressOptions,
                color: "danger",
                description: retryAt ? (
                    <>
                        {error}, try again <Timestamp date={retryAt} variant="long" inline />
                    </>
                ) : (
                    (error ?? "Failed to Sync")
                )
            };
        }
        if (!discord?.forumUrl) {
            return {
                title,
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: () => syncFn(),
                longPressOptions,
                color: "secondary",
                description: "Requires Syncing"
            };
        }
        return {
            title,
            icon: <FontAwesomeIcon icon={faDiscord} size="xl" />,
            href,
            // Browsers often refuse to open a custom protocol in a new tab
            openInNewTab: !isApp,
            longPressOptions,
            color: "success",
            description: "Synced"
        };
    }, [
        discord?.forumUrl,
        error,
        href,
        isApp,
        isError,
        isSyncing,
        project.draft,
        project.number,
        retryAt,
        step,
        syncDiscord
    ]);
}
