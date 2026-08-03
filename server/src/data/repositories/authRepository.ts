import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { RefreshToken } from "common/models/auth";
import { Database } from "./shared";

export default class AuthRepository extends Database<RefreshToken> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<RefreshToken>(mongoClient, "refreshTokens", { discordId: 1, sessionId: 1 }));
        // Ensures that refresh tokens are automatically deleted once they expire
        this.database.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        this.database.collection.createIndex({ tokenHash: 1 });
        this.database.collection.createIndex({ previousHash: 1 });
    }

    public async addRefreshToken(refreshToken: RefreshToken) {
        // Delete any existing token for this specific browser session
        await this.database.destroy({ discordId: refreshToken.discordId, sessionId: refreshToken.sessionId });
        return await this.database.create(refreshToken);
    }

    // Atomically swaps the session onto its next token, retaining the consumed hash for the grace window
    public async rotateRefreshToken(currentHash: string, nextHash: string, expiresAt: Date) {
        return await this.database.collection.findOneAndUpdate(
            { tokenHash: currentHash, expiresAt: { $gt: new Date() } },
            { $set: { tokenHash: nextHash, previousHash: currentHash, consumedAt: new Date(), expiresAt } },
            { returnDocument: "before" }
        );
    }

    public async findByPreviousHash(previousHash: string) {
        return await this.database.readOne({ previousHash });
    }

    public async deleteSession(discordId: string, sessionId: string) {
        await this.database.destroy({ discordId, sessionId });
    }
}
