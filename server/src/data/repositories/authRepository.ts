import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { RefreshToken } from "common/models/auth";
import { Database } from "./shared";

export default class AuthRepository extends Database<RefreshToken> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<RefreshToken>(mongoClient, "refreshTokens", { discordId: 1, sessionId: 1 }));
        // Ensures that refresh tokens are automatically deleted once they expire
        this.database.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }

    public async addRefreshToken(refreshToken: RefreshToken) {
        // Delete any existing token for this specific browser session
        await this.database.destroy({ discordId: refreshToken.discordId, sessionId: refreshToken.sessionId });
        return await this.database.create(refreshToken);
    }

    public async popRefreshToken(tokenHash: string) {
        const result = await this.database.readOne({ tokenHash });
        await this.database.destroy({ tokenHash });
        return result;
    }

    public async deleteSession(discordId: string, sessionId: string) {
        await this.database.destroy({ discordId, sessionId });
    }
}
