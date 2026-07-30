import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import * as Sentry from "@sentry/react";
import Error from "./error";

export default function RouteError() {
    const error = useRouteError();
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);
    return <Error content="An unknown error has occurred. Please contact administrator." />;
}
