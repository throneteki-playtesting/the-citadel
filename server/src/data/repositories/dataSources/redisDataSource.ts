import { RedisClientType, SetOptions } from "redis";

/**
 * Namespaces every key with the application, so a redis instance shared with other applications cannot
 * collide. Environments within this application are separated by logical database index instead.
 */
export default class RedisDataSource {
    private prefix = "thecitadel:";
    private client: RedisClientType;
    constructor(client: RedisClientType) {
        this.client = client;
    }

    private keyFor(key: string) {
        return `${this.prefix}${key}`;
    }

    async get(key: string) {
        return await this.client.get(this.keyFor(key));
    }

    async set(key: string, value: string, options?: SetOptions) {
        return await this.client.set(this.keyFor(key), value, options);
    }

    async del(key: string) {
        return await this.client.del(this.keyFor(key));
    }
}
