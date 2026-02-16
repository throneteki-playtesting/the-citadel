import { IPlaytestingUpdate } from "common/models/projects";
import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient, Sort } from "mongodb";
import { DeepPartial, SingleOrArray, Sortable } from "common/types";
import { IRepository } from "@/types";
import { flatten } from "flat";

export default class PlaytestingUpdateRepository implements IRepository<IPlaytestingUpdate> {
    public database: MongoDataSource<IPlaytestingUpdate>;
    constructor(mongoClient: MongoClient) {
        this.database = new MongoDataSource<IPlaytestingUpdate>(mongoClient, "playtestingUpdates", { project: 1, version: 1 });
    }

    public async create(creating: IPlaytestingUpdate): Promise<IPlaytestingUpdate>;
    public async create(creating: IPlaytestingUpdate[]): Promise<IPlaytestingUpdate[]>;
    public async create(creating: SingleOrArray<IPlaytestingUpdate>) {
        const result = await this.database.create(creating);
        return Array.isArray(creating) ? result : result[0];
    }

    public async read(reading?: SingleOrArray<DeepPartial<IPlaytestingUpdate>>, orderBy?: Sortable<IPlaytestingUpdate>, page?: number, perPage?: number) {
        const sort = orderBy ? flatten(orderBy) as Sort : undefined;
        const limit = perPage;
        const skip = (page - 1) * perPage;
        return await this.database.read(reading, { sort, limit, skip });
    }

    public async count(counting?: SingleOrArray<DeepPartial<IPlaytestingUpdate>>) {
        return await this.database.count(counting);
    }

    public async update(updating: IPlaytestingUpdate, upsert?: boolean): Promise<IPlaytestingUpdate>;
    public async update(updating: IPlaytestingUpdate[], upsert?: boolean): Promise<IPlaytestingUpdate[]>;
    public async update(updating: SingleOrArray<IPlaytestingUpdate>, upsert = true) {
        const result = await this.database.update(updating, { upsert });
        return Array.isArray(updating) ? result : result[0];
    }

    public async destroy(destroying: SingleOrArray<DeepPartial<IPlaytestingUpdate>>) {
        return await this.database.destroy(destroying);
    }
}