/* eslint-disable @typescript-eslint/no-explicit-any */
import { MongoClient } from "mongodb";
import { logger } from "@/services";
import { createClient, RedisClientType } from "redis";
import ArtistsRepository from "./repositories/artistsRepository";
import AuthRepository from "./repositories/authRepository";
import CardsRepository from "./repositories/cardsRepository";
import DecksRepository from "./repositories/decksRepository";
import IntegrationRepository from "./repositories/integrationRepository";
import LogsRepository from "./repositories/logsRepository";
import PlaytestingUpdateRepository from "./repositories/playtestingUpdateRepository";
import ProjectsRepository from "./repositories/projectsRepository";
import ReviewsRepository from "./repositories/reviewRepository";
import RolesRepository from "./repositories/rolesRepository";
import SlotsRepository from "./repositories/slotsRepository";
import SuggestionsRepository from "./repositories/suggestionsRepository";
import UsersRepository from "./repositories/usersRepository";
import { Database } from "./repositories/shared";
import RedisDataSource from "./repositories/dataSources/redisDataSource";
import { currentEnvironment, Environment } from "@/env";

type RepositoryConstructor = new (client: MongoClient) => Database<any>;

const REDIS_DATABASES: Record<Environment, number> = {
    development: 0,
    staging: 1,
    production: 2
};

interface RepositoryConfig {
    key: string;
    ctor: RepositoryConstructor;
}

const REPOSITORIES: RepositoryConfig[] = [
    { key: "projects", ctor: ProjectsRepository },
    { key: "playtestingUpdates", ctor: PlaytestingUpdateRepository },
    { key: "cards", ctor: CardsRepository },
    { key: "slots", ctor: SlotsRepository },
    { key: "artists", ctor: ArtistsRepository },
    { key: "reviews", ctor: ReviewsRepository },
    { key: "decks", ctor: DecksRepository },
    { key: "users", ctor: UsersRepository },
    { key: "roles", ctor: RolesRepository },
    { key: "suggestions", ctor: SuggestionsRepository },
    { key: "auth", ctor: AuthRepository },
    { key: "integrations", ctor: IntegrationRepository },
    { key: "logs", ctor: LogsRepository }
];

class DataService {
    private database: MongoClient | null = null;
    public redis: RedisDataSource;
    public ready: Promise<[boolean, boolean]>;

    private repos = new Map<string, Database<any>>();

    constructor() {
        this.ready = this.connect();
    }

    private async connect(): Promise<[boolean, boolean]> {
        const [database, redis] = await Promise.all([this.connectDb(), this.connectRedis()]);
        if (database) {
            await this.integrations.initialise();
        }
        return [database, redis];
    }

    private async connectDb(): Promise<boolean> {
        const url = process.env.DATABASE_URL ?? "mongodb://mongodb:27017";
        try {
            const client = new MongoClient(`${url}?retryWrites=true&retryReads=true`, {
                ignoreUndefined: true,
                maxPoolSize: 10,
                connectTimeoutMS: 5000
            });
            await client.db().command({ ping: 1 });
            logger.info(`MongoDB connected to ${client.db().databaseName}`);

            this.database = client;
            this.repos.clear();
            for (const { key, ctor } of REPOSITORIES) {
                this.repos.set(key, new ctor(this.database));
            }
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
    }

    /**
     * Redis has a single flat keyspace per logical database and no per-application namespacing, so every
     * environment sharing an instance is pinned to its own index rather than relying on REDIS_HOST to carry one.
     */
    private redisUrl(): string {
        const url = new URL(process.env.REDIS_HOST || "redis://redis:6379");
        url.pathname = `/${REDIS_DATABASES[currentEnvironment()]}`;
        return url.toString();
    }

    private async connectRedis(): Promise<boolean> {
        const url = this.redisUrl();
        try {
            const client = createClient({ url }) as RedisClientType;
            await client.connect();
            this.redis = new RedisDataSource(client);
            logger.info(`Redis connected at ${url}`);
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
    }

    private getRepository<T extends Database<any>>(key: string): T {
        const repo = this.repos.get(key);
        if (!repo) {
            throw new Error(`Repository "${key}" unavailable — call await dataService.reconnect() to retry.`);
        }
        return repo as T;
    }

    async reconnect(): Promise<void> {
        if (await this.connectDb()) {
            await this.integrations.initialise();
        }
    }

    get projects() {
        return this.getRepository<ProjectsRepository>("projects");
    }
    get playtestingUpdates() {
        return this.getRepository<PlaytestingUpdateRepository>("playtestingUpdates");
    }
    get cards() {
        return this.getRepository<CardsRepository>("cards");
    }
    get slots() {
        return this.getRepository<SlotsRepository>("slots");
    }
    get artists() {
        return this.getRepository<ArtistsRepository>("artists");
    }
    get reviews() {
        return this.getRepository<ReviewsRepository>("reviews");
    }
    get decks() {
        return this.getRepository<DecksRepository>("decks");
    }
    get users() {
        return this.getRepository<UsersRepository>("users");
    }
    get roles() {
        return this.getRepository<RolesRepository>("roles");
    }
    get suggestions() {
        return this.getRepository<SuggestionsRepository>("suggestions");
    }
    get auth() {
        return this.getRepository<AuthRepository>("auth");
    }
    get integrations() {
        return this.getRepository<IntegrationRepository>("integrations");
    }
    get logs() {
        return this.getRepository<LogsRepository>("logs");
    }
}

export default DataService;
