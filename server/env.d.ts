declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: "development" | "production" | "staging";

        VERBOSE: string;

        SERVER_PORT: number;
        SERVER_HOST: string;
        CLIENT_PORT: number;
        CLIENT_HOST: string;
        WEBHOOK_URL?: string;
        REDIS_PORT: string;
        REDIS_HOST: string;

        DISCORD_TOKEN: string;
        DISCORD_CLIENT_ID: string;
        DISCORD_CLIENT_SECRET: string;
        DISCORD_GUILD_ID: string;
        DISCORD_AUTH_REDIRECT: string;
        DISCORD_SERVER_INVITE_URL: string;

        THRONESDB_CLIENT_ID: string;
        THRONESDB_CLIENT_SECRET: string;

        GOOGLE_PRIVATE_KEY: string;
        GOOGLE_CLIENT_EMAIL: string;

        GITHUB_OWNER: string;
        GITHUB_REPOSITORY: string;
        GITHUB_REPOSITORY_DATA: string;
        GITHUB_APP_ID: string;
        GITHUB_PRIVATE_KEY: string;
        GITHUB_WEBHOOK_SECRET: string;

        DATABASE_NAME: string;
        DATABASE_URL: string;

        JWT_SECRET: string;
        ACCESS_TOKEN_TTL: string;
        REFRESH_TOKEN_TTL: string;
        IMPERSONATION_TOKEN_TTL: string;

        S3_BASE_URL: string;
        S3_BUCKET: string;
        S3_ENDPOINT: string;
        S3_REGION: string;
        S3_ACCESS_KEY_ID: string;
        S3_SECRET_ACCESS_KEY: string;
    }
}
