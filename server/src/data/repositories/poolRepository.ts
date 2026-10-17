import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { IPoolEntry } from "common/models/projects";
import { BasicRepository } from "./shared";

// A draft project's pool: the suggestions set aside to draw its slots from
export default class PoolRepository extends BasicRepository<"pool"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<IPoolEntry>(mongoClient, "projectPools", { project: 1, suggestion: 1 }), "pool");
    }
}
