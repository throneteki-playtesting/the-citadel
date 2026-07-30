interface ImportMetaEnv {
    readonly VITE_VERBOSE: boolean;
    readonly VITE_SERVER_PORT: number;
    readonly VITE_SERVER_HOST: string;
    readonly VITE_SENTRY_DSN: string;
    readonly VITE_BUG_REPORT_URL: string;
    readonly VITE_DISCORD_SERVER_INVITE_URL: string;
}
interface ImportMeta {
    readonly env: ImportMetaEnv;
}

export type AppEnv = ImportMetaEnv;
