import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { Role } from "common/models/auth";
import { BasicRepository } from "./shared";

export default class RolesRepository extends BasicRepository<Role> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<Role>(mongoClient, "roles", { name: 1 }));
    }
}