import { IPlaytestingUpdate } from "common/models/projects";
import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { IPlaytestCard } from "common/models/cards";
import { BasicAuditableRepository } from "./shared";
import { syncPullRequests } from "@/github/pullRequests";
import { logger } from "@/services";
import { SingleOrArray } from "common/types";
import { asArray } from "common/utils";
import { getContext } from "@/middleware/context";

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
            await this.sync();
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(updating: IPlaytestingUpdate, upsert?: boolean, sync?: boolean): Promise<IPlaytestingUpdate>;
    public override async update(updating: IPlaytestingUpdate[], upsert?: boolean, sync?: boolean): Promise<IPlaytestingUpdate[]>;
    public override async update(updating: SingleOrArray<IPlaytestingUpdate>, upsert = true, sync = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert);
        if (sync) {
            await this.sync();
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public async sync() {
        const syncs = [
            () => syncPullRequests()
        ];

        const { source } = getContext();

        // Client does not need to wait for syncing to complete
        if (source === "client") {
            syncs.forEach(fn => void fn().catch(err => logger.warn(err)));
        } else {
            for (const fn of syncs) {
                try {
                    await fn();
                } catch (err) {
                    logger.warn(err);
                }
            }
        }
    }

    public async for(card: IPlaytestCard) {
        const [result] = await this.database.read({ cardChanges: { [card.number]: card.version } });
        return result;
    }
}