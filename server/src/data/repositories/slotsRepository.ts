import { ISlot } from "common/models/slots";
import MongoDataSource from "./dataSources/mongoDataSource";
import { MongoClient } from "mongodb";
import { BasicAuditableRepository } from "./shared";
import { Filter, SingleOrArray } from "common/types";
import { asArray } from "common/utils";
import { deleteReleaseCheckObjections, syncReleaseCheckObjections } from "@/discord/forums/releaseCheckObjections";

export default class SlotsRepository extends BasicAuditableRepository<"slot"> {
    constructor(mongoClient: MongoClient) {
        super(new MongoDataSource<ISlot>(mongoClient, "slots", { project: 1, number: 1 }), "slot");
    }

    public override async create(creating: ISlot, sync?: boolean, broadcast?: boolean): Promise<ISlot>;
    public override async create(creating: ISlot[], sync?: boolean, broadcast?: boolean): Promise<ISlot[]>;
    public override async create(creating: SingleOrArray<ISlot>, sync = true, broadcast = true) {
        let data = asArray(creating);
        data = await super.create(data, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(creating) ? data : data[0];
    }

    public override async update(
        updating: ISlot,
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<ISlot>;
    public override async update(
        updating: ISlot[],
        upsert?: boolean,
        sync?: boolean,
        broadcast?: boolean
    ): Promise<ISlot[]>;
    public override async update(updating: SingleOrArray<ISlot>, upsert = true, sync = true, broadcast = true) {
        let data = asArray(updating);
        data = await super.update(data, upsert, broadcast);
        if (sync) {
            data = await this.sync(data);
        }
        return Array.isArray(updating) ? data : data[0];
    }

    public override async destroy(destroying: SingleOrArray<Filter<ISlot>>, sync: boolean = true) {
        let data = await super.destroy(destroying);
        if (sync) {
            data = await this.desync(data);
        }
        return data;
    }

    public async sync(syncing: ISlot): Promise<ISlot>;
    public async sync(syncing: ISlot[]): Promise<ISlot[]>;
    public async sync(syncing: SingleOrArray<ISlot>) {
        let data = asArray(syncing);
        const syncs = [
            () =>
                syncReleaseCheckObjections(data).then((result) => {
                    data = result;
                })
        ];

        await this.internalSync(syncs);

        return Array.isArray(syncing) ? data : data[0];
    }

    public async desync(desyncing: ISlot): Promise<ISlot>;
    public async desync(desyncing: ISlot[]): Promise<ISlot[]>;
    public async desync(desyncing: SingleOrArray<ISlot>) {
        const data = asArray(desyncing);
        const syncs = [() => deleteReleaseCheckObjections(data)];

        await this.internalSync(syncs);

        return Array.isArray(desyncing) ? data : data[0];
    }
}
