import { ILogEntry } from "common/models/logs";
import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { BasicRepository } from "./shared";

export default class LogsRepository extends BasicRepository<"log"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<ILogEntry>(mongoClient, "logs", { id: 1 }), "log");
    }
}
