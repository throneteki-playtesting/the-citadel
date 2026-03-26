import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { RefreshToken } from "common/models/auth";
import { Database } from "./shared";

export default class AuthRepository extends Database<RefreshToken> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<RefreshToken>(mongoClient, "refreshTokens", { discordId: 1 }));
        // Ensures that refresh tokens are automatically deleted once they expire
        this.database.collection.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });
    }
    /**
     * Adds a new refresh token to the database. Will remove existing token if exists
     */
    public async addRefreshToken(refreshToken: RefreshToken) {
        await this.database.destroy({ discordId: refreshToken.discordId });
        return await this.database.create(refreshToken);
    }
    /**
     * Returns refresh token for provided tokenHash, and deletes it from database
     */
    public async popRefreshToken(tokenHash: string) {
        const result = await this.database.readOne({ tokenHash });
        await this.database.destroy({ tokenHash });
        return result;
    }
}