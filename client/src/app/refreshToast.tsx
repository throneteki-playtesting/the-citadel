import { useEffect } from "react";
import { addToast, closeToast, getToastQueue } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrow } from "@fortawesome/free-solid-svg-icons";
import { hasPendingTags, subscribeToPending } from "../api/tagManager";
import { RefreshButton } from "./refreshButton";

let activeToastKey: string | undefined;

export function getActiveRefreshToastKey(): string | undefined {
    return activeToastKey;
}

export function setActiveRefreshToastKey(key: string | undefined): void {
    activeToastKey = key;
}

function isToastVisible(key: string | undefined): boolean {
    return key !== undefined && getToastQueue().visibleToasts.some((toast) => toast.key === key);
}

function handlePendingChange() {
    const isPending = hasPendingTags();
    const activeToastKey = getActiveRefreshToastKey();
    const isVisible = isToastVisible(activeToastKey);

    if (isPending && !isVisible) {
        setActiveRefreshToastKey(
            addToast({
                title: <div className="font-cinzel text-lg">New scrolls have arrived</div>,
                description: <div className="text-sm">Press to retrieve the latest records</div>,
                icon: <FontAwesomeIcon icon={faCrow} size="xl" />,
                endContent: <RefreshButton />,
                color: "warning",
                hideCloseButton: true,
                timeout: 0,
                // closeToast() bypasses HeroUI's built-in exit animation, so it's set explicitly here
                motionProps: {
                    exit: { opacity: 0, y: -40 }
                },
                classNames: {
                    base: "w-xs sm:w-md",
                    motionDiv: "!left-0 !right-0 !mx-auto"
                },
                onClose: () => {
                    setActiveRefreshToastKey(undefined);
                }
            }) ?? undefined
        );
    } else if (!isPending && isVisible) {
        closeToast(activeToastKey!);
        setActiveRefreshToastKey(undefined);
    }
}

export function useRefreshToast(): void {
    // useEffect (not a bare top-level call) so cleanup runs on remount/HMR, avoiding duplicate listeners
    useEffect(() => subscribeToPending(handlePendingChange), []);
}
