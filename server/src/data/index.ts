/* eslint-disable @typescript-eslint/no-explicit-any */
import { MongoClient } from "mongodb";
import { logger } from "@/services";
import { createClient, RedisClientType } from "redis";
import AuthRepository from "./repositories/authRepository";
import CardsRepository from "./repositories/cardsRepository";
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

type RepositoryConstructor = new (client: MongoClient) => Database<any>;

interface RepositoryConfig {
    key: string;
    ctor: RepositoryConstructor;
}

const REPOSITORIES: RepositoryConfig[] = [
    { key: "projects", ctor: ProjectsRepository },
    { key: "playtestingUpdates", ctor: PlaytestingUpdateRepository },
    { key: "cards", ctor: CardsRepository },
    { key: "slots", ctor: SlotsRepository },
    { key: "reviews", ctor: ReviewsRepository },
    { key: "users", ctor: UsersRepository },
    { key: "roles", ctor: RolesRepository },
    { key: "suggestions", ctor: SuggestionsRepository },
    { key: "auth", ctor: AuthRepository },
    { key: "integrations", ctor: IntegrationRepository },
    { key: "logs", ctor: LogsRepository }
];

class DataService {
    private database: MongoClient | null = null;
    public redis: RedisClientType;
    public ready: Promise<[boolean, boolean]>;

    private repos = new Map<string, Database<any>>();

    constructor() {
        this.ready = Promise.all([this.connectDb(), this.connectRedis()]);
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

    private async connectRedis(): Promise<boolean> {
        const url = process.env.REDIS_HOST || "redis://redis:6379";
        try {
            this.redis = createClient({ url }) as RedisClientType;
            await this.redis.connect();
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
        await this.connectDb();
    }

    get projects() { return this.getRepository<ProjectsRepository>("projects"); }
    get playtestingUpdates() { return this.getRepository<PlaytestingUpdateRepository>("playtestingUpdates"); }
    get cards() { return this.getRepository<CardsRepository>("cards"); }
    get slots() { return this.getRepository<SlotsRepository>("slots"); }
    get reviews() { return this.getRepository<ReviewsRepository>("reviews"); }
    get users() { return this.getRepository<UsersRepository>("users"); }
    get roles() { return this.getRepository<RolesRepository>("roles"); }
    get suggestions() { return this.getRepository<SuggestionsRepository>("suggestions"); }
    get auth() { return this.getRepository<AuthRepository>("auth"); }
    get integrations() { return this.getRepository<IntegrationRepository>("integrations"); }
    get logs() { return this.getRepository<LogsRepository>("logs"); }
}

export default DataService;