import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { SingleOrArray } from "common/types";
import { ICardSuggestion } from "common/models/cards";
import { asArray } from "common/utils";
import { BasicAuditableRepository } from "./shared";

export default class SuggestionsRepository extends BasicAuditableRepository<"suggestion"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<ICardSuggestion>(mongoClient, "suggestions", { id: 1 }), "suggestion");
    }

    public override async create(creating: ICardSuggestion): Promise<ICardSuggestion>;
    public override async create(creating: ICardSuggestion[]): Promise<ICardSuggestion[]>;
    public override async create(creating: SingleOrArray<ICardSuggestion>) {
        let data = asArray(creating);
        for (const create of data) {
            create.id = crypto.randomUUID();
        }
        data = await super.create(data);
        return Array.isArray(creating) ? data : data[0];
    }

    public async tags() {
        return await this.database.collection.distinct("tags");
    }
}
