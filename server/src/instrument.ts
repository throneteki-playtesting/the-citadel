import "@/config";
import * as Sentry from "@sentry/node";

if (process.env.NODE_ENV !== "development") {
    if (!process.env.SENTRY_SERVER_DSN) {
        throw new Error(`SENTRY_SERVER_DSN must be provided when running outside of development (NODE_ENV is "${process.env.NODE_ENV}")`);
    }

    Sentry.init({
        dsn: process.env.SENTRY_SERVER_DSN,
        environment: process.env.NODE_ENV,
        sendDefaultPii: false
    });
}
