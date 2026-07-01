import { useState } from "react";
import { Button, closeToast } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import { dispatchPendingTags } from "../api/tagManager";
import { getActiveRefreshToastKey } from "./refreshToast";

// Minimum time to show the loading spinner, since the dispatch itself is synchronous
const MIN_LOADING_MS = 400;

export function RefreshButton() {
    const [isLoading, setIsLoading] = useState(false);

    const handlePress = async () => {
        setIsLoading(true);
        dispatchPendingTags();
        setTimeout(() => {
            const toastKey = getActiveRefreshToastKey();
            if (toastKey) {
                closeToast(toastKey);
            }
        }, MIN_LOADING_MS);
    };

    return (
        <Button
            isIconOnly
            isLoading={isLoading}
            color="warning"
            variant="flat"
            aria-label="Refresh"
            onPress={handlePress}
        >
            <FontAwesomeIcon icon={faArrowsRotate}/>
        </Button>
    );
}
