import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import Error from "./error";

// How each browser words a page's code failing to download - most often because a release has replaced the files the
// open tab was built against, which a reload fixes
const CHUNK_LOAD_FAILURES = [
    "Failed to fetch dynamically imported module",
    "Importing a module script failed",
    "error loading dynamically imported module"
];

function isChunkLoadFailure(error: unknown) {
    const message = error instanceof globalThis.Error ? error.message : String(error ?? "");
    return CHUNK_LOAD_FAILURES.some((failure) => message.includes(failure));
}

// Shown in place of a page which failed - inside the app's shell, so the navbar stays and the rest of the Citadel is a
// click away - always with a way to try again rather than leaving the page blank
export default function RouteError() {
    const error = useRouteError();
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);
    const isStale = isChunkLoadFailure(error);
    return (
        <div className="flex flex-col items-center gap-4 pt-16">
            <Error
                label={isStale ? "This page couldn't be loaded..." : undefined}
                content={
                    isStale
                        ? "The Citadel may have just been updated. Reloading should bring it back."
                        : "An unknown error has occurred. Please contact administrator."
                }
            />
            <Button
                variant="flat"
                color="primary"
                startContent={<FontAwesomeIcon icon={faRotateRight} />}
                onPress={() => window.location.reload()}
            >
                Reload
            </Button>
        </div>
    );
}
