import { ISlot } from "common/models/slots";
import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { BasicAuditableRepository } from "./shared";

export default class SlotsRepository extends BasicAuditableRepository<"slot"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<ISlot>(mongoClient, "slots", { project: 1, number: 1 }), "slot");
    }
}
