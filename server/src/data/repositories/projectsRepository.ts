import { IProject } from "common/models/projects";
import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { BasicAuditableRepository } from "./shared";

export default class ProjectsRepository extends BasicAuditableRepository<IProject> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<IProject>(mongoClient, "projects", { number: 1 }));
    }
}