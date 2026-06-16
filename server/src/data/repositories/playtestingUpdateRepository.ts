import { IPlaytestingUpdate } from "common/models/projects";
import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { IPlaytestCard } from "common/models/cards";
import { BasicAuditableRepository } from "./shared";
import { syncCodePullRequests, syncDataPullRequests } from "@/github/pullRequests";
import { SingleOrArray } from "common/types";
import { asArray } from "common/utils";

export default class PlaytestingUpdateRepository extends BasicAuditableRepository<IPlaytestingUpdate> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<IPlaytestingUpdate>(mongoClient, "playtestingUpdates", { project: 1, version: 1 }));
    }

    public override async create(creating: IPlaytestingUpdate, sync?: boolean): Promise<IPlaytestingUpdate>;
    public override async create(creating: IPlaytestingUpdate[], sync?: boolean): Promise<IPlaytestingUpdate[]>;
    public override async create(creating: SingleOrArray<IPlaytestingUpdate>, sync = true) {
        let data = asArray(creating);
        data = await super.create(data);
        if (sync) {
            await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(updating: IPlaytestingUpdate, upsert?: boolean, sync?: boolean): Promise<IPlaytestingUpdate>;
    public override async update(updating: IPlaytestingUpdate[], upsert?: boolean, sync?: boolean): Promise<IPlaytestingUpdate[]>;
    public override async update(updating: SingleOrArray<IPlaytestingUpdate>, upsert = true, sync = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert);
        if (sync) {
            await this.sync(data);
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public async sync(syncing: SingleOrArray<IPlaytestingUpdate>) {
        let data = asArray(syncing);
        const syncs = [
            () => syncCodePullRequests(data).then(result => { data = result; }),
            () => syncDataPullRequests(data).then(result => { data = result; })
        ];

        await this.internalSync(syncs);

        return data;
    }

    public async for(card: IPlaytestCard) {
        const [result] = await this.database.read({ cardChanges: { [card.number]: card.version } });
        return result;
    }
}