import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { User } from "common/models/auth";
import { BasicRepository } from "./shared";

export default class UsersRepository extends BasicRepository<User> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<User>(mongoClient, "users", { discordId: 1 }));
    }
}