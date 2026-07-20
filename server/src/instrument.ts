import "@/config";
import * as Sentry from "@sentry/node";
import { isEnvironment } from "@/env";

if (isEnvironment("staging", "production")) {
    if (!process.env.SENTRY_SERVER_DSN) {
        throw new Error(`SENTRY_SERVER_DSN must be provided when running in staging or production (NODE_ENV is "${process.env.NODE_ENV}")`);
    }

    Sentry.init({
        dsn: process.env.SENTRY_SERVER_DSN,
        environment: process.env.NODE_ENV,
        sendDefaultPii: false
    });
}
